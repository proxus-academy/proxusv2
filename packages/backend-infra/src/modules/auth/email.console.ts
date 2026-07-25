import { Console, Effect, Layer } from "effect"
import { EmailDelivery, EmailDeliveryError, type AuthEmailMessage } from "@proxus/backend-domain/auth"

export interface ConsoleEmailRecord {
  readonly recipient: string
  readonly purpose: AuthEmailMessage["purpose"]
  readonly code: string
  readonly expiresAt: Date
}

/** Explicit secret-bearing sink. It must only be installed in development or tests. */
export type ConsoleEmailSink = (record: ConsoleEmailRecord) => Effect.Effect<void, EmailDeliveryError>

export const consoleEmailSink: ConsoleEmailSink = (record) =>
  Console.log(`[auth-email:development-only] purpose=${record.purpose} recipient=${record.recipient} code=${record.code} expiresAt=${record.expiresAt.toISOString()}`)

export const makeConsoleEmailDelivery = (sink: ConsoleEmailSink): Layer.Layer<EmailDelivery> =>
  Layer.succeed(EmailDelivery, EmailDelivery.of({
    sendVerification: Effect.fn("ConsoleEmailDelivery.sendVerification")((message) =>
      sink(message).pipe(Effect.mapError((cause) => new EmailDeliveryError({ kind: "verification", cause })))),
    sendPasswordReset: Effect.fn("ConsoleEmailDelivery.sendPasswordReset")((message) =>
      sink(message).pipe(Effect.mapError((cause) => new EmailDeliveryError({ kind: "password-reset", cause })))),
  }))

export const ConsoleEmailDelivery = makeConsoleEmailDelivery(consoleEmailSink)

/** Deliberate startup failure until a real production mail adapter is configured. */
export const ProductionEmailDeliveryUnavailable: Layer.Layer<EmailDelivery, EmailDeliveryError> =
  Layer.effect(EmailDelivery, Effect.fail(new EmailDeliveryError({
    kind: "verification",
    cause: "A real production email delivery adapter is required",
  })))
