import { sql } from "drizzle-orm"
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { users } from "./auth.js"

export const roleAssignments = pgTable(
  "role_assignments",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "catalog-editor", "student"] }).notNull(),
    scopeType: text("scope_type", { enum: ["studyCatalog", "studyNode", "studyEdge"] }).notNull(),
    scopeId: text("scope_id").notNull(),
    grantedBy: uuid("granted_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("role_assignments_assignment_uidx").on(table.userId, table.role, table.scopeType, table.scopeId),
    index("role_assignments_scope_idx").on(table.scopeType, table.scopeId),
    index("role_assignments_granted_by_idx").on(table.grantedBy),
    check("role_assignments_role_check", sql`${table.role} in ('admin', 'catalog-editor', 'student')`),
    check("role_assignments_scope_type_check", sql`${table.scopeType} in ('studyCatalog', 'studyNode', 'studyEdge')`),
    check("role_assignments_scope_id_check", sql`length(btrim(${table.scopeId})) > 0`),
  ],
)

export type RoleAssignmentRow = typeof roleAssignments.$inferSelect
