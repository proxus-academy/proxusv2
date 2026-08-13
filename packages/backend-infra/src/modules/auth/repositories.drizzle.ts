import {
  AuthChallengeNotFound,
  AuthChallengeRepository,
  AuthRepositoryError,
  InvalidRepositoryState,
  UserConflict,
  UserNotFound,
  UserRepository,
  type AuthChallenge,
  type User,
} from "@proxus/backend-domain/auth"
import { and, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-postgres"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Effect, Option, Semaphore } from "effect"
import { authChallenges, users, type AuthChallengeRow, type UserRow } from "../../database/schema.js"

type AuthDatabase = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>

const userFromRow = (row: UserRow): User => ({
  id: row.id as User["id"], email: row.emailNormalized, status: row.status,
  emailVerifiedAt: row.emailVerifiedAt, passwordHash: row.passwordHash, googleSubject: row.googleSubject,
  usernameNormalized: row.usernameNormalized, birthYear: row.birthYear, problemKind: row.problemKind,
  problemOther: row.problemOther, acquisitionSource: row.acquisitionSource,
  acquisitionOther: row.acquisitionOther, studyId: row.studyId, subjectId: row.subjectId,
  createdAt: row.createdAt, updatedAt: row.updatedAt,
})
const challengeFromRow = (row: AuthChallengeRow): AuthChallenge => ({
  id: row.id as AuthChallenge["id"], userId: row.userId as AuthChallenge["userId"], purpose: row.purpose,
  codeHash: row.codeHash, expiresAt: row.expiresAt, failedAttempts: row.failedAttempts,
  maximumAttempts: row.maximumAttempts, consumedAt: row.consumedAt, createdAt: row.createdAt,
})
const first = <A>(rows: ReadonlyArray<A>) => Option.fromIterable(rows)

const constraintName = (error: unknown): string => {
  const pending: Array<unknown> = [error]
  const seen = new Set<object>()
  const text: Array<string> = []
  while (pending.length > 0) {
    const current = pending.shift()
    if (typeof current !== "object" || current === null || seen.has(current)) continue
    seen.add(current)
    const record: Record<string, unknown> = Object.fromEntries(Object.entries(current))
    if (typeof record.constraint === "string") text.push(record.constraint)
    if (typeof record.message === "string") text.push(record.message)
    pending.push(...Object.values(record))
  }
  return text.join(" ")
}
const conflict = (error: unknown): UserConflict | undefined => {
  const constraint = constraintName(error)
  if (constraint.includes("users_email_normalized_uidx")) return new UserConflict({ field: "email" })
  if (constraint.includes("users_username_normalized_uidx")) return new UserConflict({ field: "username" })
  if (constraint.includes("users_google_subject_uidx")) return new UserConflict({ field: "google-subject" })
  return undefined
}
const repositoryError = (operation: string, cause: unknown) => new AuthRepositoryError({ operation, cause })

export const makeUserRepositoryDrizzle = (db: AuthDatabase) => {
  // A driver may expose a single connection (PGlite). Serializing the short
  // uniqueness write also gives every loser a committed row to classify.
  const createLock = Semaphore.makeUnsafe(1)
  const create = (user: User) => createLock.withPermit(db.insert(users).values({
    id: user.id, emailNormalized: user.email, status: user.status, emailVerifiedAt: user.emailVerifiedAt,
    passwordHash: user.passwordHash, googleSubject: user.googleSubject, usernameNormalized: user.usernameNormalized,
    birthYear: user.birthYear, problemKind: user.problemKind, problemOther: user.problemOther,
    acquisitionSource: user.acquisitionSource, acquisitionOther: user.acquisitionOther,
    studyId: user.studyId, subjectId: user.subjectId, createdAt: user.createdAt, updatedAt: user.updatedAt,
  }).onConflictDoNothing().returning().pipe(
    Effect.flatMap((rows) => Option.match(first(rows), {
      onNone: () => db.select({
        email: users.emailNormalized, username: users.usernameNormalized, googleSubject: users.googleSubject,
      }).from(users).where(or(
        eq(users.emailNormalized, user.email),
        eq(users.usernameNormalized, user.usernameNormalized),
        ...(user.googleSubject === null ? [] : [eq(users.googleSubject, user.googleSubject)]),
      )).pipe(
        Effect.mapError((cause) => repositoryError("createUser", cause)),
        Effect.flatMap((existing): Effect.Effect<never, UserConflict | AuthRepositoryError> => {
          if (existing.some((row) => row.email === user.email)) return Effect.fail(new UserConflict({ field: "email" }))
          if (existing.some((row) => row.username === user.usernameNormalized)) return Effect.fail(new UserConflict({ field: "username" }))
          if (user.googleSubject !== null && existing.some((row) => row.googleSubject === user.googleSubject)) return Effect.fail(new UserConflict({ field: "google-subject" }))
          return Effect.fail(repositoryError("createUser", new Error("conflict row was not observable")))
        }),
      ),
      onSome: (row) => Effect.succeed(userFromRow(row)),
    })),
    Effect.mapError((error: unknown) => error instanceof UserConflict || error instanceof AuthRepositoryError
      ? error
      : conflict(error) ?? repositoryError("createUser", error)),
  ))
  const updateOne = (operation: string, id: User["id"], values: Partial<typeof users.$inferInsert>) =>
    db.update(users).set(values).where(eq(users.id, id)).returning().pipe(
      Effect.flatMap((rows) => Option.match(first(rows), {
        onNone: () => Effect.fail(new UserNotFound({ userId: id })),
        onSome: (row) => Effect.succeed(userFromRow(row)),
      })),
      Effect.mapError((error: unknown) => error instanceof UserNotFound ? error : repositoryError(operation, error)),
    )
  return UserRepository.of({
    createPending: create, createGoogleActive: create,
    findByEmail: (email) => db.select().from(users).where(eq(users.emailNormalized, email)).limit(1).pipe(
      Effect.map((rows) => Option.map(first(rows), userFromRow)), Effect.mapError((cause) => repositoryError("findByEmail", cause))),
    findByGoogleSubject: (subject) => db.select().from(users).where(eq(users.googleSubject, subject)).limit(1).pipe(
      Effect.map((rows) => Option.map(first(rows), userFromRow)), Effect.mapError((cause) => repositoryError("findByGoogleSubject", cause))),
    linkGoogle: (id, subject, linkedAt) => Effect.gen(function*() {
      const rows = yield* db.update(users).set({ googleSubject: subject, updatedAt: linkedAt }).where(and(
        eq(users.id, id), eq(users.status, "active"), sql`${users.emailVerifiedAt} is not null`,
        or(isNull(users.googleSubject), eq(users.googleSubject, subject)),
      )).returning()
      if (rows[0] !== undefined) return userFromRow(rows[0])
      const existing = yield* db.select().from(users).where(eq(users.id, id)).limit(1)
      if (existing[0] === undefined) return yield* new UserNotFound({ userId: id })
      return yield* new InvalidRepositoryState({ entity: "user" })
    }).pipe(Effect.mapError((error: unknown) => error instanceof UserNotFound || error instanceof InvalidRepositoryState
      ? error : conflict(error) ?? repositoryError("linkGoogle", error))),
    getById: (id) => db.select().from(users).where(eq(users.id, id)).limit(1).pipe(
      Effect.map((rows) => Option.map(first(rows), userFromRow)), Effect.mapError((cause) => repositoryError("getById", cause))),
    listAll: () => db.select().from(users).orderBy(desc(users.createdAt)).pipe(
      Effect.map((rows) => rows.map(userFromRow)), Effect.mapError((cause) => repositoryError("listUsers", cause))),
    activate: (id, verifiedAt) => Effect.gen(function*() {
      const rows = yield* db.update(users).set({ status: "active", emailVerifiedAt: verifiedAt, updatedAt: verifiedAt })
        .where(and(eq(users.id, id), eq(users.status, "pending"))).returning()
      if (rows[0] !== undefined) return userFromRow(rows[0])
      const existing = yield* db.select({ status: users.status }).from(users).where(eq(users.id, id)).limit(1)
      return yield* existing.length === 0
        ? new UserNotFound({ userId: id })
        : new InvalidRepositoryState({ entity: "user" })
    }).pipe(Effect.mapError((error: unknown) => error instanceof UserNotFound || error instanceof InvalidRepositoryState
      ? error
      : repositoryError("activate", error))),
    disable: (id, disabledAt) => updateOne("disable", id, { status: "disabled", updatedAt: disabledAt }),
    enable: (id, enabledAt) => db.update(users).set({ status: "active", updatedAt: enabledAt }).where(and(
      eq(users.id, id), eq(users.status, "disabled"), isNotNull(users.emailVerifiedAt),
    )).returning().pipe(
      Effect.flatMap((rows) => rows[0] === undefined
        ? Effect.fail(new InvalidRepositoryState({ entity: "user" }))
        : Effect.succeed(userFromRow(rows[0]))),
      Effect.mapError((error: unknown) => error instanceof InvalidRepositoryState ? error : repositoryError("enable", error)),
    ),
    usernameExists: (username) => db.select({ id: users.id }).from(users).where(eq(users.usernameNormalized, username)).limit(1).pipe(
      Effect.map((rows) => rows.length > 0), Effect.mapError((cause) => repositoryError("usernameExists", cause))),
    updatePasswordHash: (id, passwordHash, updatedAt) => updateOne("updatePasswordHash", id, { passwordHash, updatedAt }),
  })
}

export const makeAuthChallengeRepositoryDrizzle = (db: AuthDatabase, inTransaction = false) => AuthChallengeRepository.of({
  issue: (challenge) => (inTransaction ? Effect.gen(function*() {
    yield* db.select({ id: users.id }).from(users).where(eq(users.id, challenge.userId)).for("update")
    yield* db.update(authChallenges).set({ consumedAt: challenge.createdAt }).where(and(
      eq(authChallenges.userId, challenge.userId), eq(authChallenges.purpose, challenge.purpose), isNull(authChallenges.consumedAt),
    ))
    const rows = yield* db.insert(authChallenges).values({ ...challenge, id: challenge.id, userId: challenge.userId }).returning()
    return yield* Option.match(first(rows), {
      onNone: () => Effect.fail(repositoryError("issueChallenge", new Error("insert returned no row"))),
      onSome: (row) => Effect.succeed(challengeFromRow(row)),
    })
  }) : db.transaction((tx) => Effect.gen(function*() {
    // The parent row is the cross-process serialization point. This makes
    // revoke-then-insert one atomic operation even with concurrent issuers.
    yield* tx.select({ id: users.id }).from(users).where(eq(users.id, challenge.userId)).for("update")
    yield* tx.update(authChallenges).set({ consumedAt: challenge.createdAt }).where(and(
      eq(authChallenges.userId, challenge.userId), eq(authChallenges.purpose, challenge.purpose), isNull(authChallenges.consumedAt),
    ))
    const rows = yield* tx.insert(authChallenges).values({ ...challenge, id: challenge.id, userId: challenge.userId }).returning()
    return yield* Option.match(first(rows), {
      onNone: () => Effect.fail(repositoryError("issueChallenge", new Error("insert returned no row"))),
      onSome: (row) => Effect.succeed(challengeFromRow(row)),
    })
  }))).pipe(Effect.mapError((error: unknown) => error instanceof AuthRepositoryError ? error : repositoryError("issueChallenge", error))),
  findLatest: (userId, purpose, now) => db.select().from(authChallenges).where(and(
    eq(authChallenges.userId, userId), eq(authChallenges.purpose, purpose),
  )).orderBy(desc(authChallenges.createdAt), desc(authChallenges.id)).limit(1).pipe(
    Effect.map((rows) => {
      const row = rows[0]
      if (row === undefined) return { _tag: "Missing" } as const
      const challenge = challengeFromRow(row)
      if (challenge.consumedAt !== null) return { _tag: "Used", challenge } as const
      if (challenge.expiresAt <= now) return { _tag: "Expired", challenge } as const
      if (challenge.failedAttempts >= challenge.maximumAttempts) return { _tag: "AttemptsExceeded", challenge } as const
      return { _tag: "Active", challenge } as const
    }), Effect.mapError((cause) => repositoryError("findLatestChallenge", cause))),
  findActive: (userId, purpose, now) => db.select().from(authChallenges).where(and(
    eq(authChallenges.userId, userId), eq(authChallenges.purpose, purpose), isNull(authChallenges.consumedAt),
    gt(authChallenges.expiresAt, now), lt(authChallenges.failedAttempts, authChallenges.maximumAttempts),
  )).orderBy(desc(authChallenges.createdAt), desc(authChallenges.id)).limit(1).pipe(
    Effect.map((rows) => Option.map(first(rows), challengeFromRow)), Effect.mapError((cause) => repositoryError("findActiveChallenge", cause))),
  recordFailure: (id) => db.update(authChallenges).set({
    failedAttempts: sql`least(${authChallenges.maximumAttempts}, ${authChallenges.failedAttempts} + 1)`,
  }).where(eq(authChallenges.id, id)).returning().pipe(
    Effect.flatMap((rows) => Option.match(first(rows), {
      onNone: () => Effect.fail(new AuthChallengeNotFound()), onSome: (row) => Effect.succeed(challengeFromRow(row)),
    })), Effect.mapError((error: unknown) => error instanceof AuthChallengeNotFound ? error : repositoryError("recordChallengeFailure", error))),
  consume: (id, consumedAt) => Effect.gen(function*() {
    const rows = yield* db.update(authChallenges).set({ consumedAt }).where(and(
      eq(authChallenges.id, id), isNull(authChallenges.consumedAt), gt(authChallenges.expiresAt, consumedAt),
      lt(authChallenges.failedAttempts, authChallenges.maximumAttempts),
    )).returning({ id: authChallenges.id })
    if (rows.length > 0) return
    const existing = yield* db.select({ id: authChallenges.id }).from(authChallenges).where(eq(authChallenges.id, id)).limit(1)
    const error: AuthChallengeNotFound | InvalidRepositoryState = existing.length === 0
      ? new AuthChallengeNotFound()
      : new InvalidRepositoryState({ entity: "challenge" })
    return yield* error
  }).pipe(Effect.mapError((error: unknown) => error instanceof AuthChallengeNotFound || error instanceof InvalidRepositoryState ? error : repositoryError("consumeChallenge", error))),
  revokePurpose: (userId, purpose, revokedAt) => db.update(authChallenges).set({ consumedAt: revokedAt }).where(and(
    eq(authChallenges.userId, userId), eq(authChallenges.purpose, purpose), isNull(authChallenges.consumedAt),
  )).pipe(Effect.asVoid, Effect.mapError((cause) => repositoryError("revokeChallengePurpose", cause))),
})
