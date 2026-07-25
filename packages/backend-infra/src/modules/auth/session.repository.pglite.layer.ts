import { SessionRepository } from "@proxus/backend-domain/auth"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer } from "effect"
import { makeSessionRepositoryDrizzle } from "./session.repository.drizzle.js"

export const SessionRepositoryPgliteLive = Layer.effect(
  SessionRepository,
  PgliteDrizzle.makeWithDefaults().pipe(Effect.map(makeSessionRepositoryDrizzle)),
)
