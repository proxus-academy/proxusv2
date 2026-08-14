// @effect-diagnostics asyncFunction:off strictEffectProvide:off
import { EmailDelivery } from "@proxus/backend-domain/auth"
import { DateTime, Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeMailgunEmailDelivery, type MailgunAuthMessage } from "./email.mailgun.js"

const verification = {
  recipient: "student@example.test",
  purpose: "verify-email" as const,
  code: "123456",
  expiresAt: DateTime.toDateUtc(DateTime.makeUnsafe("2026-08-14T10:15:00.000Z")),
}

const capture = (messages: MailgunAuthMessage[]) => (message: MailgunAuthMessage) => {
  messages.push(message)
  return Promise.resolve()
}

describe("MailgunEmailDelivery", () => {
  test("sends verification codes through the configured EU-compatible Mailgun sender", async () => {
    const messages: MailgunAuthMessage[] = []
    await Effect.runPromise(Effect.gen(function*() {
      const email = yield* EmailDelivery
      yield* email.sendVerification(verification)
    }).pipe(Effect.provide(makeMailgunEmailDelivery(
      "mail.example.test",
      "Proxus <noreply@example.test>",
      capture(messages),
    ))))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      domain: "mail.example.test",
      from: "Proxus <noreply@example.test>",
      to: "student@example.test",
      subject: "Verifica tu correo de Proxus",
      "o:tag": ["proxus-auth", "verify-email"],
      "o:tracking": "no",
      "o:tracking-clicks": "no",
      "o:tracking-opens": "no",
      "o:require-tls": "yes",
      "o:skip-verification": "no",
    })
    expect(messages[0]?.text).toContain("123456")
    expect(messages[0]?.html).toContain("123456")
    expect(messages[0]?.html).toContain("2026-08-14T10:15:00.000Z")
  })

  test("uses the password-reset error kind and redacts provider details", async () => {
    const failure = { status: 503, details: "must not leak" }
    const result = await Effect.runPromise(Effect.gen(function*() {
      const email = yield* EmailDelivery
      yield* email.sendPasswordReset({ ...verification, purpose: "reset-password" })
    }).pipe(
      Effect.provide(makeMailgunEmailDelivery(
        "mail.example.test",
        "Proxus <noreply@example.test>",
        () => Promise.reject(failure),
      )),
      Effect.catch((error) => Effect.succeed(error)),
    ))

    expect(result).toMatchObject({
      _tag: "EmailDeliveryError",
      kind: "password-reset",
      cause: { provider: "mailgun", status: 503 },
    })
    expect(String(result)).not.toContain("must not leak")
  })

  test("escapes provider-facing HTML even when called with an invalid code fixture", async () => {
    const messages: MailgunAuthMessage[] = []
    await Effect.runPromise(Effect.gen(function*() {
      const email = yield* EmailDelivery
      yield* email.sendVerification({ ...verification, code: "<unsafe>" })
    }).pipe(Effect.provide(makeMailgunEmailDelivery(
      "mail.example.test",
      "Proxus <noreply@example.test>",
      capture(messages),
    ))))

    expect(messages[0]?.html).toContain("&lt;unsafe&gt;")
    expect(messages[0]?.html).not.toContain("<unsafe>")
  })
})
