import { RoleAssignmentsRepository } from "@proxus/backend-domain/access-control"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Effect, Layer } from "effect"
import { makeRoleAssignmentsRepositoryDrizzle } from "./repository.drizzle.js"

export const RoleAssignmentsRepositoryPostgresLive = Layer.effect(
  RoleAssignmentsRepository,
  PostgresDrizzle.makeWithDefaults().pipe(Effect.map(makeRoleAssignmentsRepositoryDrizzle)),
)
