import { Context, Data, Effect, Layer, Ref } from "effect"
import { Access, type AccessPermission, type AccessRole, type AccessScopeType } from "./access.js"
import { Forbidden, RoleStoreError, type Resource, type RoleQuery, type RoleStoreContract, type Scope, type Subject } from "./engine/index.js"

export interface RoleAssignment {
  readonly userId: string
  readonly role: AccessRole
  readonly scope: Scope<AccessScopeType>
  readonly grantedBy: string
  readonly grantedAt: Date
}

export class RoleAssignmentStoreError extends Data.TaggedError("RoleAssignmentStoreError")<{
  readonly operation: "getRoles" | "grant" | "revoke" | "countAdmins"
  readonly cause?: unknown
}> {}
export class DuplicateRoleAssignment extends Data.TaggedError("DuplicateRoleAssignment")<{}> {}
export class RoleAssignmentNotFound extends Data.TaggedError("RoleAssignmentNotFound")<{}> {}
export class InvalidRoleScope extends Data.TaggedError("InvalidRoleScope")<{
  readonly role: AccessRole
  readonly scope: Scope<AccessScopeType>
}> {}
export class LastAdministrator extends Data.TaggedError("LastAdministrator")<{}> {}

export class RoleAssignmentsRepository extends Context.Service<RoleAssignmentsRepository, {
  readonly getRoles: (query: RoleQuery<AccessScopeType>) => Effect.Effect<readonly AccessRole[], RoleAssignmentStoreError>
  readonly grant: (assignment: RoleAssignment) => Effect.Effect<void, DuplicateRoleAssignment | RoleAssignmentStoreError>
  readonly revoke: (assignment: Pick<RoleAssignment, "userId" | "role" | "scope">) => Effect.Effect<void, RoleAssignmentNotFound | RoleAssignmentStoreError>
  readonly countAdmins: () => Effect.Effect<number, RoleAssignmentStoreError>
}>()("@proxus/backend-domain/modules/access-control/service/RoleAssignmentsRepository") {}

const globalScope = Access.scope("studyCatalog", "global")
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const validScope = (role: AccessRole, scope: Scope<AccessScopeType>): boolean => {
  if (scope.type === "studyCatalog") return scope.id === "global"
  if (!uuid.test(scope.id)) return false
  return role === "catalog-editor"
}
const isGlobalAdmin = (assignment: Pick<RoleAssignment, "role" | "scope">) =>
  assignment.role === "admin" && assignment.scope.type === globalScope.type && assignment.scope.id === globalScope.id

export interface AccessControlServiceContract {
  readonly requireAdministrator: (subject: Subject) => Effect.Effect<void, Forbidden | RoleStoreError>
  readonly capabilities: (subject: Subject, resource?: Resource<AccessScopeType>) => Effect.Effect<ReadonlySet<AccessPermission>, RoleStoreError>
  readonly require: (subject: Subject, permission: AccessPermission, resource: Resource<AccessScopeType>) => Effect.Effect<void, Forbidden | RoleStoreError>
  readonly grantRole: (actor: Subject, assignment: Omit<RoleAssignment, "grantedBy" | "grantedAt">, grantedAt: Date) => Effect.Effect<void, Forbidden | RoleStoreError | InvalidRoleScope | DuplicateRoleAssignment | RoleAssignmentStoreError>
  readonly revokeRole: (actor: Subject, assignment: Pick<RoleAssignment, "userId" | "role" | "scope">) => Effect.Effect<void, Forbidden | RoleStoreError | InvalidRoleScope | LastAdministrator | RoleAssignmentNotFound | RoleAssignmentStoreError>
}
export class AccessControlService extends Context.Service<AccessControlService, AccessControlServiceContract>()("@proxus/backend-domain/modules/access-control/service/AccessControlService") {}

const adminResource = Access.resource("studyCatalog", "global")
// The canonical engine deliberately accepts adapter-owned failures as unknown and normalizes them here.
// @effect-diagnostics anyUnknownInErrorContext:off
const requireAdministrator = (actor: Subject) => Effect.gen(function* () {
  const store = yield* Access.RoleStore
  const roles = yield* store.getRoles({ subject: actor, scopes: [globalScope] }).pipe(
    Effect.mapError((cause) => cause instanceof RoleStoreError ? cause : new RoleStoreError({ message: "RoleStore failed", cause }))
  )
  if (!roles.includes("admin")) return yield* new Forbidden({ subject: actor, resource: adminResource, message: "Administrator role required" })
})

export const AccessControlServiceLive = Layer.effect(AccessControlService, Effect.gen(function* () {
  const repository = yield* RoleAssignmentsRepository
  const roleStore: RoleStoreContract<AccessRole, AccessScopeType, RoleStoreError> = {
    getRoles: (query) => repository.getRoles(query).pipe(Effect.mapError((cause) => new RoleStoreError({ message: "RoleStore failed", cause })))
  }
  const withStore = <A, E, R>(effect: Effect.Effect<A, E, R | typeof Access.RoleStore.Identifier>) =>
    effect.pipe(Effect.provideService(Access.RoleStore, roleStore))
  const checkScope = (assignment: Pick<RoleAssignment, "role" | "scope">) =>
    validScope(assignment.role, assignment.scope) ? Effect.void : Effect.fail(new InvalidRoleScope(assignment))

  return AccessControlService.of({
    requireAdministrator: (subject) => withStore(requireAdministrator(subject)),
    capabilities: (subject, resource = adminResource) => withStore(Effect.gen(function* () {
      const store = yield* Access.RoleStore
      const scopes = Access.effectiveScopes(resource)
      const roles = yield* store.getRoles({ subject, scopes }).pipe(
        Effect.mapError((cause) => cause instanceof RoleStoreError ? cause : new RoleStoreError({ message: "RoleStore failed", cause }))
      )
      return yield* Effect.try({
        try: () => {
          const validRoles = roles.filter(Access.roles.has)
          if (validRoles.length !== roles.length) throw new RoleStoreError({ message: "RoleStore returned invalid roles" })
          return Access.permissionsForRoles(validRoles)
        },
        catch: (cause) => cause instanceof RoleStoreError ? cause : new RoleStoreError({ message: "RoleStore returned invalid roles", cause })
      })
    })),
    require: (subject, permission, resource) => withStore(Access.policyFor(permission, { subject, resource })),
    grantRole: (actor, assignment, grantedAt) => withStore(Effect.gen(function* () {
      yield* requireAdministrator(actor)
      yield* checkScope(assignment)
      yield* repository.grant({ ...assignment, grantedBy: actor.id, grantedAt })
    })),
    revokeRole: (actor, assignment) => withStore(Effect.gen(function* () {
      yield* requireAdministrator(actor)
      yield* checkScope(assignment)
      if (isGlobalAdmin(assignment) && (yield* repository.countAdmins()) <= 1) return yield* new LastAdministrator()
      yield* repository.revoke(assignment)
    }))
  })
}))

export const makeMemoryRoleAssignmentsRepository = (initial: readonly RoleAssignment[] = []) => Layer.effect(RoleAssignmentsRepository, Effect.gen(function* () {
  const key = (value: Pick<RoleAssignment, "userId" | "role" | "scope">) => `${value.userId}\0${value.role}\0${value.scope.type}\0${value.scope.id}`
  const state = yield* Ref.make(new Map(initial.map((assignment) => [key(assignment), assignment])))
  return RoleAssignmentsRepository.of({
    getRoles: ({ subject, scopes }) => Ref.get(state).pipe(Effect.map((all) => [...new Set([...all.values()].filter((a) => a.userId === subject.id && subject.type === "user" && scopes.some((s) => s.type === a.scope.type && s.id === a.scope.id)).map((a) => a.role))])),
    grant: (assignment) => Effect.gen(function* () {
      const all = yield* Ref.get(state)
      if (all.has(key(assignment))) return yield* new DuplicateRoleAssignment()
      yield* Ref.set(state, new Map(all).set(key(assignment), assignment))
    }),
    revoke: (assignment) => Effect.gen(function* () {
      const all = yield* Ref.get(state)
      if (!all.has(key(assignment))) return yield* new RoleAssignmentNotFound()
      const next = new Map(all); next.delete(key(assignment)); yield* Ref.set(state, next)
    }),
    countAdmins: () => Ref.get(state).pipe(Effect.map((all) => [...all.values()].filter(isGlobalAdmin).length))
  })
}))
