import { DuplicateRoleAssignment, RoleAssignmentNotFound, RoleAssignmentStoreError, type AccessRole, type RoleAssignmentsRepository, type RoleAssignment } from "@proxus/backend-domain/access-control"
import { and, eq, or, sql } from "drizzle-orm"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Effect } from "effect"
import { roleAssignments } from "../../database/schema.js"

type Database = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>
const failure = (operation: RoleAssignmentStoreError["operation"]) => (cause: unknown) => new RoleAssignmentStoreError({ operation, cause })
const uniqueViolation = (cause: unknown): boolean => {
  if (typeof cause !== "object" || cause === null) return false
  const value = cause as { readonly code?: unknown; readonly cause?: unknown }
  return value.code === "23505" || uniqueViolation(value.cause)
}

export const makeRoleAssignmentsRepositoryDrizzle = (db: Database): typeof RoleAssignmentsRepository.Service => ({
  getRoles: ({ subject, scopes }) => {
    if (subject.type !== "user" || scopes.length === 0) return Effect.succeed([])
    return db.select({ role: roleAssignments.role }).from(roleAssignments).where(and(
      eq(roleAssignments.userId, subject.id),
      or(...scopes.map((scope) => and(eq(roleAssignments.scopeType, scope.type), eq(roleAssignments.scopeId, scope.id)))),
    )).pipe(
      Effect.map((rows) => [...new Set(rows.map(({ role }) => role as AccessRole))]),
      Effect.mapError(failure("getRoles")),
    )
  },
  grant: (assignment: RoleAssignment) => db.insert(roleAssignments).values({
    userId: assignment.userId,
    role: assignment.role,
    scopeType: assignment.scope.type,
    scopeId: assignment.scope.id,
    grantedBy: assignment.grantedBy,
    grantedAt: assignment.grantedAt,
  }).pipe(Effect.asVoid, Effect.mapError((cause) => uniqueViolation(cause) ? new DuplicateRoleAssignment() : failure("grant")(cause))),
  revoke: (assignment) => db.delete(roleAssignments).where(and(
    eq(roleAssignments.userId, assignment.userId), eq(roleAssignments.role, assignment.role),
    eq(roleAssignments.scopeType, assignment.scope.type), eq(roleAssignments.scopeId, assignment.scope.id),
  )).returning({ userId: roleAssignments.userId }).pipe(
    Effect.mapError(failure("revoke")),
    Effect.flatMap((rows) => rows.length === 0 ? Effect.fail(new RoleAssignmentNotFound()) : Effect.void),
  ),
  countAdmins: () => db.select({ count: sql<number>`count(*)` }).from(roleAssignments).where(and(
    eq(roleAssignments.role, "admin"), eq(roleAssignments.scopeType, "studyCatalog"), eq(roleAssignments.scopeId, "global"),
  )).pipe(Effect.map((rows) => Number(rows[0]?.count ?? 0)), Effect.mapError(failure("countAdmins"))),
})
