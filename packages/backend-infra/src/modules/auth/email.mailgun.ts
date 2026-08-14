import FormData from "form-data"
import Mailgun from "mailgun.js"
import type { MailgunMessageData } from "mailgun.js/definitions"
import { EmailDelivery, EmailDeliveryError, type AuthEmailMessage } from "@proxus/backend-domain/auth"
import { Config, Effect, Layer, Redacted } from "effect"

const defaultApiUrl = "https://api.eu.mailgun.net"
const requestTimeoutMillis = 10_000

export interface MailgunAuthMessage {
  readonly domain: string
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string
  readonly "o:tag": string[]
  readonly "o:tracking": "no"
  readonly "o:tracking-clicks": "no"
  readonly "o:tracking-opens": "no"
  readonly "o:require-tls": "yes"
  readonly "o:skip-verification": "no"
}

export type MailgunAuthSender = (message: MailgunAuthMessage) => Promise<unknown>

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;")

const renderMessage = (domain: string, from: string, message: AuthEmailMessage): MailgunAuthMessage => {
  const verification = message.purpose === "verify-email"
  const title = verification ? "Verifica tu correo de Proxus" : "Restablece tu contraseña de Proxus"
  const explanation = verification
    ? "Usa este código para verificar tu dirección de correo:"
    : "Usa este código para restablecer tu contraseña:"
  const expiration = message.expiresAt.toISOString()
  const code = escapeHtml(message.code)

  return {
    domain,
    from,
    to: message.recipient,
    subject: title,
    text: `${explanation}\n\n${message.code}\n\nEl código caduca el ${expiration}. Si no has solicitado esta operación, ignora este correo.`,
    html: `<!doctype html><html lang="es"><body><h1>${title}</h1><p>${explanation}</p><p style="font-size:2rem;font-weight:700;letter-spacing:.25rem">${code}</p><p>El código caduca el <time datetime="${expiration}">${expiration}</time>.</p><p>Si no has solicitado esta operación, ignora este correo.</p></body></html>`,
    "o:tag": ["proxus-auth", message.purpose],
    "o:tracking": "no",
    "o:tracking-clicks": "no",
    "o:tracking-opens": "no",
    "o:require-tls": "yes",
    "o:skip-verification": "no",
  }
}

const safeFailure = (cause: unknown): { readonly provider: "mailgun"; readonly status?: number } => {
  if (typeof cause !== "object" || cause === null || !("status" in cause) || typeof cause.status !== "number") {
    return { provider: "mailgun" }
  }
  return { provider: "mailgun", status: cause.status }
}

export const makeMailgunEmailDelivery = (
  domain: string,
  from: string,
  send: MailgunAuthSender,
): Layer.Layer<EmailDelivery> => {
  const deliver = (message: AuthEmailMessage) => Effect.tryPromise({
    try: () => send(renderMessage(domain, from, message)),
    catch: (cause) => new EmailDeliveryError({ kind: message.purpose === "verify-email" ? "verification" : "password-reset", cause: safeFailure(cause) }),
  }).pipe(Effect.asVoid)

  return Layer.succeed(EmailDelivery, EmailDelivery.of({
    sendVerification: Effect.fn("MailgunEmailDelivery.sendVerification")(deliver),
    sendPasswordReset: Effect.fn("MailgunEmailDelivery.sendPasswordReset")(deliver),
  }))
}

export const MailgunEmailDeliveryLive = Layer.unwrap(Effect.gen(function*() {
  const apiKey = yield* Config.redacted("MAILGUN_API_KEY")
  const domain = yield* Config.string("MAILGUN_DOMAIN")
  const from = yield* Config.string("MAILGUN_FROM")
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
    return yield* new EmailDeliveryError({ kind: "verification", cause: { provider: "mailgun", configuration: "domain" } })
  }
  const address = "[^\\s<>@]+@[^\\s<>@]+"
  if (!new RegExp(`^(?:${address}|[^<>\\r\\n]{1,100} <${address}>)$`).test(from) || from.length > 320) {
    return yield* new EmailDeliveryError({ kind: "verification", cause: { provider: "mailgun", configuration: "from" } })
  }
  const client = new Mailgun(FormData).client({
    username: "api",
    key: Redacted.value(apiKey),
    url: defaultApiUrl,
    timeout: requestTimeoutMillis,
  })

  return makeMailgunEmailDelivery(domain, from, ({ domain: sendingDomain, ...message }) => {
    const data: MailgunMessageData = {
      text: message.text,
      html: message.html,
      from: message.from,
      to: message.to,
      subject: message.subject,
      "o:tag": message["o:tag"],
      "o:tracking": message["o:tracking"],
      "o:tracking-clicks": message["o:tracking-clicks"],
      "o:tracking-opens": message["o:tracking-opens"],
      "o:require-tls": message["o:require-tls"],
      "o:skip-verification": message["o:skip-verification"],
    }
    return client.messages.create(sendingDomain, data)
  })
}))
