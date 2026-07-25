// @effect-diagnostics asyncFunction:off globalDateInEffect:off
import { PgliteClient } from "@effect/sql-pglite"
import { AuthChallengeRepository, UserRepository } from "@proxus/backend-domain/auth"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer, Scope } from "effect"
import { migratePglite } from "../../database/pglite.js"
import { studyNodes } from "../../database/schema.js"
import { makeAuthChallengeRepositoryDrizzle, makeUserRepositoryDrizzle } from "./repositories.drizzle.js"
import { makeAuthChallengeRepositoryMemory, makeAuthUserRepositoryMemory } from "./repositories.memory.js"
import { authRepositoryContract, subjectId, type RepositoryContractRun } from "./test/repository-contract.js"

const memoryRun = async (): Promise<RepositoryContractRun> => {
  const scope = Effect.runSync(Scope.make())
  const context = await Effect.runPromise(Layer.build(Layer.merge(makeAuthUserRepositoryMemory(), makeAuthChallengeRepositoryMemory())).pipe(
    Effect.provideService(Scope.Scope, scope),
  ))
  return (effect) => Effect.runPromise(effect.pipe(Effect.provide(context)))
}

const pgliteRun = async (): Promise<RepositoryContractRun> => {
  const scope = Effect.runSync(Scope.make())
  const context = await Effect.runPromise(Layer.build(PgliteClient.layer()).pipe(Effect.provideService(Scope.Scope, scope)))
  const services = await Effect.runPromise(Effect.gen(function*() {
    const db = yield* PgliteDrizzle.makeWithDefaults()
    yield* migratePglite("./drizzle")
    const now = new Date("2026-01-01T00:00:00Z")
    yield* db.insert(studyNodes).values([
      { id: "00000000-0000-4000-8000-000000000001", kind: "country", name: "Country", status: "published", createdAt: now, updatedAt: now },
      { id: "00000000-0000-4000-8000-000000000002", kind: "type", name: "Type", status: "published", createdAt: now, updatedAt: now },
      { id: "00000000-0000-4000-8000-000000000003", kind: "university", name: "University", status: "published", createdAt: now, updatedAt: now },
      { id: "00000000-0000-4000-8000-000000000004", kind: "degree", name: "Degree", status: "published", createdAt: now, updatedAt: now },
      { id: subjectId, kind: "subject", name: "Subject", status: "published", createdAt: now, updatedAt: now },
    ])
    return {
      users: makeUserRepositoryDrizzle(db),
      challenges: makeAuthChallengeRepositoryDrizzle(db),
    }
  }).pipe(Effect.provide(context)))
  return (effect) => Effect.runPromise(effect.pipe(
    Effect.provideService(UserRepository, services.users),
    Effect.provideService(AuthChallengeRepository, services.challenges),
  ))
}

authRepositoryContract("memory", memoryRun)
authRepositoryContract("PGlite", pgliteRun)
