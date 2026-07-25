import { SessionRepository } from "@proxus/backend-domain/auth"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Effect, Layer } from "effect"
import { makeSessionRepositoryDrizzle } from "./session.repository.drizzle.js"

export const SessionRepositoryPostgresLive = Layer.effect(
  SessionRepository,
  PostgresDrizzle.makeWithDefaults().pipe(Effect.map(makeSessionRepositoryDrizzle)),
)
