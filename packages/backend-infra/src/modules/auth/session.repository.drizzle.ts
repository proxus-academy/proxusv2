import { AuthRepositoryError, SessionNotFound, SessionRepository, makeSessionId, makeUserId } from "@proxus/backend-domain/auth"
import { and, eq, gt, isNull, or } from "drizzle-orm"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Effect, Option } from "effect"
import { authSessions, type AuthSessionRow } from "../../database/schema/auth.js"

type Database = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>

const toSession = (row: AuthSessionRow) => ({
  id: makeSessionId(row.id),
  userId: makeUserId(row.userId),
  tokenHash: row.tokenHash,
  previousTokenHash: row.previousTokenHash,
  previousTokenValidUntil: row.previousTokenValidUntil,
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
  createdAt: row.createdAt,
})

export const makeSessionRepositoryDrizzle = (db: Database) => {
  const protect = (operation: string) => Effect.mapError((cause: unknown) => new AuthRepositoryError({ operation, cause }))
  return SessionRepository.of({
    create: (session) => db.insert(authSessions).values(session).returning().pipe(
      Effect.flatMap((rows) => rows[0] === undefined ? Effect.die("session insert returned no row") : Effect.succeed(toSession(rows[0]))),
      protect("session.create"),
    ),
    findActiveByTokenHash: (hash, now) => db.select().from(authSessions).where(and(
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, now),
      or(eq(authSessions.tokenHash, hash), and(eq(authSessions.previousTokenHash, hash), gt(authSessions.previousTokenValidUntil, now))),
    )).limit(1).pipe(Effect.map((rows) => Option.fromUndefinedOr(rows[0]).pipe(Option.map(toSession))), protect("session.findActive")),
    rotate: (input) => db.transaction((tx) => Effect.gen(function*() {
      const changed = yield* tx.update(authSessions).set({
        tokenHash: input.nextTokenHash,
        previousTokenHash: input.presentedTokenHash,
        previousTokenValidUntil: input.previousTokenValidUntil,
        expiresAt: input.expiresAt,
      }).where(and(eq(authSessions.id, input.id), eq(authSessions.tokenHash, input.presentedTokenHash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, input.now))).returning()
      if (changed[0] !== undefined) return { _tag: "Rotated", session: toSession(changed[0]) } as const
      const current = yield* tx.select().from(authSessions).where(and(eq(authSessions.id, input.id), eq(authSessions.previousTokenHash, input.presentedTokenHash), gt(authSessions.previousTokenValidUntil, input.now), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, input.now))).limit(1)
      return current[0] === undefined ? { _tag: "NotActive" } as const : { _tag: "AlreadyRotated", session: toSession(current[0]) } as const
    })).pipe(protect("session.rotate")),
    revoke: (id, revokedAt) => db.update(authSessions).set({ revokedAt }).where(eq(authSessions.id, id)).returning({ id: authSessions.id }).pipe(
      Effect.flatMap((rows) => rows.length === 0 ? Effect.fail(new SessionNotFound()) : Effect.void),
      Effect.mapError((error) => error instanceof SessionNotFound ? error : new AuthRepositoryError({ operation: "session.revoke", cause: error })),
    ),
    revokeAllForAccount: (userId, revokedAt) => db.update(authSessions).set({ revokedAt }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt))).pipe(Effect.asVoid, protect("session.revokeAll")),
  })
}
