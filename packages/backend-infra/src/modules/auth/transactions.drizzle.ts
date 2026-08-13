import { randomBytes, randomUUID } from "node:crypto"
import { AuthChallengeRepository, AuthRepositoryError, AuthTransactions, SessionIssuer, UserRepository, makeSessionId, type AuthSession } from "@proxus/backend-domain/auth"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Clock, DateTime, Effect } from "effect"
import { authSessions } from "../../database/schema.js"
import { makeAuthChallengeRepositoryDrizzle, makeUserRepositoryDrizzle } from "./repositories.drizzle.js"
import { hashSessionToken } from "./sessions.js"

type Database = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>

export const makeAuthTransactionsDrizzle = (db: Database, sessionTtlMillis: number) => AuthTransactions.of({
  withTransaction: (program) => db.transaction((tx) => {
    const issuer = SessionIssuer.of({
      issue: (userId) => Effect.gen(function*() {
        const token = randomBytes(32).toString("base64url")
        const createdAt = DateTime.toDateUtc(DateTime.makeUnsafe(yield* Clock.currentTimeMillis))
        const session: AuthSession = {
          id: makeSessionId(randomUUID()), userId, tokenHash: hashSessionToken(token), previousTokenHash: null,
          previousTokenValidUntil: null, expiresAt: DateTime.toDateUtc(DateTime.makeUnsafe(createdAt.getTime() + sessionTtlMillis)),
          revokedAt: null, createdAt,
        }
        const rows = yield* tx.insert(authSessions).values(session).returning()
        if (rows.length === 0) return yield* new AuthRepositoryError({ operation: "session.issue", cause: "insert returned no row" })
        return { session, token }
      }).pipe(Effect.mapError((cause) => cause instanceof AuthRepositoryError ? cause : new AuthRepositoryError({ operation: "session.issue", cause }))),
    })
    return program.pipe(
      Effect.provideService(SessionIssuer, issuer),
      // SAFETY: The surrounding typed contract establishes the asserted representation.
      Effect.provideService(AuthChallengeRepository, makeAuthChallengeRepositoryDrizzle(tx as Database, true)),
      // SAFETY: The surrounding typed contract establishes the asserted representation.
      Effect.provideService(UserRepository, makeUserRepositoryDrizzle(tx as Database)),
    )
  }).pipe(Effect.catchTag("SqlError", (cause) => new AuthRepositoryError({ operation: "auth.transaction", cause }))),
})
