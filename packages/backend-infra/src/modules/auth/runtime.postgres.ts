import { AuthChallengeRepository, AuthTransactions, UserRepository } from "@proxus/backend-domain/auth"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Effect, Layer } from "effect"
import { makeAuthChallengeRepositoryDrizzle, makeUserRepositoryDrizzle } from "./repositories.drizzle.js"
import { SessionRepositoryPostgresLive } from "./session.repository.postgres.layer.js"
import { makeAuthTransactionsDrizzle } from "./transactions.drizzle.js"

export const makeAuthPersistencePostgresLive = (sessionTtlMillis: number) => Layer.merge(
  Layer.unwrap(PostgresDrizzle.makeWithDefaults().pipe(Effect.map((db) => Layer.mergeAll(
    Layer.succeed(UserRepository, makeUserRepositoryDrizzle(db)),
    Layer.succeed(AuthChallengeRepository, makeAuthChallengeRepositoryDrizzle(db)),
    Layer.succeed(AuthTransactions, makeAuthTransactionsDrizzle(db, sessionTtlMillis)),
  )))),
  SessionRepositoryPostgresLive,
)
