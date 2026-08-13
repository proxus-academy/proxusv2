/**
 * Adapted from effect-access 0.1.0, commit 134768b.
 * Copyright JavierDeDiegoGuzman. See THIRD_PARTY_NOTICES.md.
 */
import { Context, Effect } from "effect"
import { AccessDefinitionError, RoleStoreError } from "./errors.js"
import { forbidden } from "./forbidden.js"
import { dedupeRefs, effectiveScopes, isObjectRef, resource as makeResource, sameRef, scope as makeScope, subject as makeSubject } from "./refs.js"
import { makeAccessSchemas } from "./schema.js"
import { guard, all, any, toBool, type Policy } from "./policy.js"
import type {
  PermissionConfig, PermissionOf, Resource, ResourceInput, ResourceMappers,
  ResourceTypeOf, ResourceTypeOfPermission, RoleBinding, RoleConfig, RoleOf, RoleStoreDefinition, Scope, Subject
} from "./types.js"

export interface AccessDefinition<
  Permissions extends PermissionConfig,
  Roles extends RoleConfig<PermissionOf<Permissions>>,
  Resources extends ResourceMappers<ResourceTypeOf<Permissions>> = {}
> {
  readonly permissions: Permissions
  readonly roles: Roles
  readonly resources?: Resources
}

/** Public, stable shape returned by defineAccess. */
export interface AccessApi<
  Permissions extends PermissionConfig,
  Roles extends RoleConfig<PermissionOf<Permissions>>,
  Resources extends ResourceMappers<ResourceTypeOf<Permissions>> = {}
> {
  readonly definition: AccessDefinition<Permissions, Roles, Resources>
  readonly permissions: { readonly config: Permissions; readonly all: ReadonlySet<PermissionOf<Permissions>>; readonly has: (value: string) => value is PermissionOf<Permissions> }
  readonly roles: { readonly config: Roles; readonly all: ReadonlySet<RoleOf<Roles>>; readonly has: (value: string) => value is RoleOf<Roles> }
  readonly schemas: ReturnType<typeof makeAccessSchemas<Permissions, Roles>>
  readonly CurrentSubject: Context.Service<AccessApi.CurrentSubject<Permissions, Roles>, Subject>
  readonly RoleStore: Context.Service<AccessApi.RoleStore<Permissions, Roles>, RoleStoreDefinition<string, ResourceTypeOf<Permissions>, unknown>>
  readonly subject: typeof makeSubject
  readonly scope: <const Type extends ResourceTypeOf<Permissions>, const Id extends string>(type: Type, id: Id) => Scope<Type, Id>
  readonly resource: <const Type extends ResourceTypeOf<Permissions>, const Id extends string>(type: Type, id: Id, options?: { readonly scopes?: readonly Scope<ResourceTypeOf<Permissions>>[] }) => Resource<Type, Id>
  readonly toResource: <const P extends PermissionOf<Permissions>>(permission: P, input: ResourceInput<Resources, ResourceTypeOf<Permissions>, P>) => Resource<Extract<ResourceTypeOfPermission<P>, ResourceTypeOf<Permissions>>>
  readonly effectiveScopes: typeof effectiveScopes
  readonly roleBinding: (input: { readonly subject: Subject; readonly scope: Scope<ResourceTypeOf<Permissions>>; readonly role: string }) => RoleBinding<RoleOf<Roles>, ResourceTypeOf<Permissions>>
  readonly makeRoleStore: (bindings: Iterable<RoleBinding<RoleOf<Roles>, ResourceTypeOf<Permissions>>>) => RoleStoreDefinition<RoleOf<Roles>, ResourceTypeOf<Permissions>>
  readonly permissionsForRoles: (roles: Iterable<RoleOf<Roles>>) => ReadonlySet<PermissionOf<Permissions>>
  readonly can: <const P extends PermissionOf<Permissions>>(permission: P, input: ResourceInput<Resources, ResourceTypeOf<Permissions>, P>) => Effect.Effect<boolean, RoleStoreError, AccessApi.CurrentSubject<Permissions, Roles> | AccessApi.RoleStore<Permissions, Roles>>
  readonly canFor: (permission: PermissionOf<Permissions>, input: { readonly subject: Subject; readonly resource: Resource<ResourceTypeOf<Permissions>> }) => Effect.Effect<boolean, RoleStoreError, AccessApi.RoleStore<Permissions, Roles>>
  readonly permission: AccessApi<Permissions, Roles, Resources>["policy"]
  readonly policy: <const P extends PermissionOf<Permissions>>(permission: P, input: ResourceInput<Resources, ResourceTypeOf<Permissions>, P>) => Policy<RoleStoreError, AccessApi.CurrentSubject<Permissions, Roles> | AccessApi.RoleStore<Permissions, Roles>>
  readonly policyFor: (permission: PermissionOf<Permissions>, input: { readonly subject: Subject; readonly resource: Resource<ResourceTypeOf<Permissions>> }) => Policy<RoleStoreError, AccessApi.RoleStore<Permissions, Roles>>
  readonly makePolicy: <Error = never, Requirements = never>(predicate: (subject: Subject) => Effect.Effect<boolean, Error, Requirements>, options?: { readonly message?: string }) => Policy<Error, AccessApi.CurrentSubject<Permissions, Roles> | Requirements>
  readonly guard: typeof guard
  readonly require: <const P extends PermissionOf<Permissions>>(permission: P, input: ResourceInput<Resources, ResourceTypeOf<Permissions>, P>) => ReturnType<typeof guard<RoleStoreError, AccessApi.CurrentSubject<Permissions, Roles> | AccessApi.RoleStore<Permissions, Roles>>>
  readonly all: typeof all
  readonly any: typeof any
  readonly toBool: typeof toBool
}

export declare namespace AccessApi {
  interface CurrentSubject<Permissions extends PermissionConfig, Roles extends RoleConfig<PermissionOf<Permissions>>> { readonly _accessCurrentSubject: readonly [Permissions, Roles] }
  interface RoleStore<Permissions extends PermissionConfig, Roles extends RoleConfig<PermissionOf<Permissions>>> { readonly _accessRoleStore: readonly [Permissions, Roles] }
}

let accessInstance = 0
const failDefinition = (message: string): never => { throw new AccessDefinitionError({ message }) }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const unique = <A>(values: Iterable<A>): readonly A[] => Array.from(new Set(values))

export const defineAccess = <
  const Permissions extends PermissionConfig,
  const Roles extends RoleConfig<PermissionOf<Permissions>>,
  const Resources extends ResourceMappers<ResourceTypeOf<Permissions>> = {}
>(definition: AccessDefinition<Permissions, Roles, Resources>): AccessApi<Permissions, Roles, Resources> => {
  type Permission = PermissionOf<Permissions>
  type Role = RoleOf<Roles>
  type ScopeType = ResourceTypeOf<Permissions>

  if (!isRecord(definition)) failDefinition("defineAccess requires an object")
  if (!isRecord(definition.permissions)) failDefinition("permissions must be an object")
  if (!isRecord(definition.roles)) failDefinition("roles must be an object")

  const permissionValues: Permission[] = []
  const scopeTypes = new Set<string>()
  const isPermission = (value: string): value is Permission => {
    const separator = value.indexOf(":")
    if (separator <= 0) return false
    const type = value.slice(0, separator)
    const action = value.slice(separator + 1)
    const configured: unknown = definition.permissions[type]
    return Array.isArray(configured) && configured.some((candidate) => candidate === action)
  }
  const isRole = (value: string): value is Role => Object.hasOwn(definition.roles, value)
  const isScopeType = (value: string): value is ScopeType => scopeTypes.has(value)
  for (const [type, actions] of Object.entries(definition.permissions)) {
    if (type.length === 0 || type.includes(":")) failDefinition(`Invalid resource type: ${JSON.stringify(type)}`)
    if (!Array.isArray(actions) || actions.length === 0) failDefinition(`Resource ${type} requires at least one action`)
    scopeTypes.add(type)
    for (const action of actions) {
      if (typeof action !== "string" || action.length === 0 || action.includes(":")) failDefinition(`Invalid action for resource ${type}`)
      const permission = `${type}:${action}`
      if (isPermission(permission)) permissionValues.push(permission)
      else failDefinition(`Invalid permission: ${permission}`)
    }
  }
  const dedupedPermissions = unique(permissionValues)
  if (dedupedPermissions.length === 0) failDefinition("defineAccess requires at least one permission")

  const roleValues = Object.keys(definition.roles).filter(isRole)
  if (roleValues.length === 0) failDefinition("defineAccess requires at least one role")
  const permissionSet = new Set<Permission>(dedupedPermissions)
  for (const [role, permissions] of Object.entries(definition.roles)) {
    if (role.length === 0) failDefinition("Role names must be non-empty")
    if (!Array.isArray(permissions)) failDefinition(`Role ${role} permissions must be an array`)
    for (const permission of permissions) {
      if (typeof permission !== "string" || !isPermission(permission))
        failDefinition(`Role ${role} references unknown permission ${String(permission)}`)
    }
  }

  if (definition.resources !== undefined) {
    if (!isRecord(definition.resources)) failDefinition("resources must be an object")
    for (const [type, mapper] of Object.entries(definition.resources)) {
      if (!scopeTypes.has(type)) failDefinition(`Mapper references unknown resource type ${type}`)
      if (typeof mapper !== "function") failDefinition(`Mapper for ${type} must be a function`)
    }
  }

  const id = ++accessInstance
  class CurrentSubject extends Context.Service<AccessApi.CurrentSubject<Permissions, Roles>, Subject>()(`effect-access/CurrentSubject/${id}`) {}
  class RoleStore extends Context.Service<AccessApi.RoleStore<Permissions, Roles>, RoleStoreDefinition<string, ScopeType, unknown>>()(`effect-access/RoleStore/${id}`) {}
  const roleSet = new Set<Role>(roleValues)
  const schemas = makeAccessSchemas(definition)

  const subject = makeSubject
  const scope = <const Type extends ScopeType, const Id extends string>(type: Type, id: Id): Scope<Type, Id> => makeScope(type, id)
  const resource = <const Type extends ScopeType, const Id extends string>(
    type: Type, id: Id, options?: { readonly scopes?: readonly Scope<ScopeType>[] }
  ): Resource<Type, Id> => {
    const candidate = makeResource(type, id, options)
    validateResource(type, candidate)
    return candidate
  }

  function validateResource<const Type extends ScopeType>(expected: Type, value: unknown): Resource<Type> {
    if (isRecord(value) && isObjectRef(value) && Array.isArray(value.scopes)) {
      if (value.type !== expected) failDefinition(`Mapper for ${expected} returned resource type ${String(value.type)}`)
      const scopes: Scope[] = []
      for (const parent of value.scopes) {
        if (!isObjectRef(parent) || !isScopeType(parent.type)) failDefinition(`Resource ${expected} contains an invalid scope`)
        scopes.push(parent)
      }
      return { type: expected, id: value.id, scopes: dedupeRefs(scopes) }
    }
    return failDefinition(`Mapper for ${expected} returned an invalid resource`)
  }

  const resourceTypeOfPermission = <const P extends Permission>(permission: P): Extract<ResourceTypeOfPermission<P>, ScopeType> => {
    const isExpectedType = (value: string): value is Extract<ResourceTypeOfPermission<P>, ScopeType> => permission.startsWith(`${value}:`) && isScopeType(value)
    const type = permission.slice(0, permission.indexOf(":"))
    if (isExpectedType(type)) return type
    return failDefinition(`Permission ${permission} has an invalid resource type`)
  }

  const mapResource = (type: string, input: unknown): unknown => {
    const resources: unknown = definition.resources
    if (!isRecord(resources)) return input
    const mapper = resources[type]
    return typeof mapper === "function" ? mapper(input) : input
  }
  const toResource = <const P extends Permission>(permission: P, input: ResourceInput<Resources, ScopeType, P>): Resource<Extract<ResourceTypeOfPermission<P>, ScopeType>> => {
    const type = resourceTypeOfPermission(permission)
    return validateResource(type, mapResource(type, input))
  }

  const roleBinding = (input: { readonly subject: Subject; readonly scope: Scope<ScopeType>; readonly role: string }): RoleBinding<Role, ScopeType> => {
    if (!isObjectRef(input.subject)) throw new TypeError("Role binding has an invalid subject")
    if (!isObjectRef(input.scope) || !scopeTypes.has(input.scope.type)) throw new TypeError("Role binding has an invalid scope")
    if (!isRole(input.role)) throw new TypeError(`Role binding has unknown role ${String(input.role)}`)
    return { ...input, role: input.role }
  }

  const makeRoleStore = (bindings: Iterable<RoleBinding<Role, ScopeType>>): RoleStoreDefinition<Role, ScopeType> => {
    const normalized = new Map<string, RoleBinding<Role, ScopeType>>()
    for (const binding of bindings) {
      roleBinding(binding)
      normalized.set(`${binding.subject.type}\0${binding.subject.id}\0${binding.scope.type}\0${binding.scope.id}\0${binding.role}`, binding)
    }
    const allBindings = [...normalized.values()]
    return { getRoles: ({ subject, scopes }) => Effect.succeed(unique(allBindings.filter((binding) =>
      sameRef(binding.subject, subject) && scopes.some((candidate) => sameRef(candidate, binding.scope))
    ).map((binding) => binding.role))) }
  }

  const permissionsForRoles = (roles: Iterable<Role>): ReadonlySet<Permission> => {
    const result = new Set<Permission>()
    for (const role of roles) {
      if (!roleSet.has(role)) throw new RoleStoreError({ message: `RoleStore returned unknown role ${String(role)}` })
      for (const permission of definition.roles[role] ?? []) result.add(permission)
    }
    return result
  }

  // `unknown` is the adapter-owned RoleStore error before normalization at this seam.
  // @effect-diagnostics anyUnknownInErrorContext:off
  const normalizedRoles = (store: RoleStoreDefinition<string, ScopeType, unknown>, query: { readonly subject: Subject; readonly scopes: readonly Scope<ScopeType>[] }) =>
    Effect.flatMap(
      Effect.try({ try: () => store.getRoles(query), catch: (cause) => new RoleStoreError({ message: "RoleStore threw", cause }) }),
      (request) => Effect.flatMap(
        Effect.mapError(request, (cause) => cause instanceof RoleStoreError ? cause : new RoleStoreError({ message: "RoleStore failed", cause })),
        (roles) => Effect.try({
          try: () => {
            if (!Array.isArray(roles)) throw new TypeError("getRoles must return an array")
            // SAFETY: The surrounding typed contract establishes the asserted representation.
            for (const role of roles as readonly unknown[]) if (typeof role !== "string" || !roleSet.has(role as Role)) throw new TypeError(`Unknown role ${String(role)}`)
            // SAFETY: The surrounding typed contract establishes the asserted representation.
            return unique(roles as readonly Role[])
          },
          catch: (cause) => new RoleStoreError({ message: "RoleStore returned invalid roles", cause })
        })
      )
    )

  const canFor = (permission: Permission, input: { readonly subject: Subject; readonly resource: Resource<ScopeType> }) =>
    Effect.flatMap(RoleStore, (store) => Effect.map(
      // SAFETY: The surrounding typed contract establishes the asserted representation.
      normalizedRoles(store, { subject: input.subject, scopes: effectiveScopes(input.resource) as readonly Scope<ScopeType>[] }),
      (roles) => permissionsForRoles(roles).has(permission)
    ))

  const policyFor = (permission: Permission, input: { readonly subject: Subject; readonly resource: Resource<ScopeType> }): Policy<RoleStoreError, typeof RoleStore.Identifier> =>
    Effect.flatMap(canFor(permission, input), (allowed) => allowed ? Effect.void : Effect.fail(forbidden({ permission, subject: input.subject, resource: input.resource, message: `Missing permission: ${permission}` })))

  const can = <const P extends Permission>(permission: P, input: ResourceInput<Resources, ScopeType, P>) =>
    Effect.flatMap(CurrentSubject, (current) => canFor(permission, { subject: current, resource: toResource(permission, input) }))
  const policy = <const P extends Permission>(permission: P, input: ResourceInput<Resources, ScopeType, P>) =>
    Effect.flatMap(CurrentSubject, (current) => policyFor(permission, { subject: current, resource: toResource(permission, input) }))
  const makePolicy = <Error = never, Requirements = never>(predicate: (subject: Subject) => Effect.Effect<boolean, Error, Requirements>, options?: { readonly message?: string }): Policy<Error, typeof CurrentSubject.Identifier | Requirements> =>
    Effect.flatMap(CurrentSubject, (current) => Effect.flatMap(predicate(current), (allowed) => allowed ? Effect.void : Effect.fail(forbidden({ subject: current, message: options?.message ?? "Policy denied" }))))
  const require = <const P extends Permission>(permission: P, input: ResourceInput<Resources, ScopeType, P>) => guard(policy(permission, input))

  const api: AccessApi<Permissions, Roles, Resources> = {
    definition, permissions: { config: definition.permissions, all: permissionSet, has: isPermission },
    roles: { config: definition.roles, all: roleSet, has: isRole },
    schemas, CurrentSubject, RoleStore, subject, scope, resource, toResource, effectiveScopes, roleBinding, makeRoleStore,
    permissionsForRoles, can, canFor, permission: policy, policy, makePolicy, policyFor, guard, require, all, any, toBool
  }
  return api
}
