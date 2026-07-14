import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const studyNodes = pgTable(
  "study_nodes",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    index("study_nodes_kind_idx").on(table.kind),
    index("study_nodes_status_idx").on(table.status),
  ],
)

export const studyEdges = pgTable(
  "study_edges",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").notNull(),
    fromNodeId: uuid("from_node_id")
      .notNull()
      .references(() => studyNodes.id, { onDelete: "restrict" }),
    toNodeId: uuid("to_node_id")
      .notNull()
      .references(() => studyNodes.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    uniqueIndex("study_edges_kind_from_to_uidx").on(
      table.kind,
      table.fromNodeId,
      table.toNodeId,
    ),
    index("study_edges_from_idx").on(table.fromNodeId),
    index("study_edges_to_idx").on(table.toNodeId),
  ],
)

export type StudyNodeRow = typeof studyNodes.$inferSelect
export type StudyEdgeRow = typeof studyEdges.$inferSelect
