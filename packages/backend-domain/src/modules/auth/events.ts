import { Schema } from "effect"

/** All active sessions were revoked after an authoritative credential change. */
export class AccountSessionsRevoked extends Schema.TaggedClass<AccountSessionsRevoked>()(
  "identity.account-sessions-revoked",
  {
    version: Schema.Literal(1),
    accountId: Schema.String,
  },
) {}

export const AuthEvent = Schema.Union([AccountSessionsRevoked])
export type AuthEvent = typeof AuthEvent.Type
