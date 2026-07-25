import { RoleAssignmentsRepository } from "@proxus/backend-domain/access-control"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer } from "effect"
import { makeRoleAssignmentsRepositoryDrizzle } from "./repository.drizzle.js"

export const RoleAssignmentsRepositoryPgliteLive = Layer.effect(
  RoleAssignmentsRepository,
  PgliteDrizzle.makeWithDefaults().pipe(Effect.map(makeRoleAssignmentsRepositoryDrizzle)),
)
