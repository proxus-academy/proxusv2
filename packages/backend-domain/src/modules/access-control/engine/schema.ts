/**
 * Adapted from effect-access 0.1.0, commit 134768b.
 * Copyright JavierDeDiegoGuzman. See THIRD_PARTY_NOTICES.md.
 */
import { Schema } from "effect"
import type { PermissionConfig, PermissionOf, RoleConfig, RoleOf } from "./types.js"

const nonEmptyLiterals = <const Values extends readonly [string, ...string[]]>(values: Values) =>
  Schema.Literals(values)

const objectRefSchema = Schema.Struct({
  type: Schema.String,
  id: Schema.String
})

const subjectSchema = objectRefSchema
const scopeSchema = objectRefSchema

const resourceSchema = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
  scopes: Schema.Array(scopeSchema)
})

export const makeAccessSchemas = <
  const Permissions extends PermissionConfig,
  const Roles extends RoleConfig<PermissionOf<Permissions>>
>(definition: { readonly permissions: Permissions; readonly roles: Roles }) => {
  type Permission = PermissionOf<Permissions>
  type Role = RoleOf<Roles>
  type ScopeType = keyof Permissions & string

  const isPermission = (value: string): value is Permission => value.includes(":")
  const isRole = (value: string): value is Role => Object.hasOwn(definition.roles, value)
  const isScopeType = (value: string): value is ScopeType => Object.hasOwn(definition.permissions, value)
  const permissionValues = Object.entries(definition.permissions).flatMap(([resource, actions]) =>
    actions.map((action) => `${resource}:${action}`).filter(isPermission)
  )
  const roleValues = Object.keys(definition.roles).filter(isRole)
  const scopeTypeValues = Object.keys(definition.permissions).filter(isScopeType)

  if (permissionValues.length === 0) {
    throw new Error("defineAccess requires at least one permission")
  }
  if (roleValues.length === 0) {
    throw new Error("defineAccess requires at least one role")
  }

  const [firstPermission, ...remainingPermissions] = permissionValues
  const [firstRole, ...remainingRoles] = roleValues
  const [firstScopeType, ...remainingScopeTypes] = scopeTypeValues
  if (firstPermission === undefined || firstRole === undefined || firstScopeType === undefined) {
    throw new Error("defineAccess requires non-empty permissions, roles, and scope types")
  }
  const Permission = nonEmptyLiterals([firstPermission, ...remainingPermissions])
  const Role = nonEmptyLiterals([firstRole, ...remainingRoles])
  const ScopeType = nonEmptyLiterals([firstScopeType, ...remainingScopeTypes])

  const Scope = Schema.Struct({
    type: ScopeType,
    id: Schema.String
  })

  const Resource = Schema.Struct({
    type: ScopeType,
    id: Schema.String,
    scopes: Schema.Array(Scope)
  })

  const RoleBinding = Schema.Struct({
    subject: subjectSchema,
    scope: Scope,
    role: Role
  })

  const RoleAssignmentRow = Schema.Struct({
    subjectType: Schema.String,
    subjectId: Schema.String,
    scopeType: ScopeType,
    scopeId: Schema.String,
    role: Role
  })

  return {
    Permission,
    Role,
    ScopeType,
    Subject: subjectSchema,
    Scope,
    Resource,
    RoleBinding,
    RoleAssignmentRow
  }
}
