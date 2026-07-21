import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const studyAssets = pgTable(
  "study_assets",
  {
    id: uuid("id").primaryKey(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    uniqueIndex("study_assets_storage_key_uidx").on(table.storageKey),
  ],
)

export const studyNodes = pgTable(
  "study_nodes",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    imageAssetId: uuid("image_asset_id").references(() => studyAssets.id, {
      onDelete: "set null",
    }),
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

export const featureFlagSnapshots = pgTable(
  "feature_flag_snapshots",
  {
    configurationRevision: bigint("configuration_revision", { mode: "bigint" }).primaryKey(),
    configuration: jsonb("configuration").notNull(),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("feature_flag_snapshots_single_active_uidx")
      .on(table.active)
      .where(sql`${table.active} = true`),
    check("feature_flag_snapshots_revision_wire_range_check", sql`${table.configurationRevision} between 0 and 9007199254740991`),
  ],
)

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey(),
  record: jsonb("record").notNull(),
  status: text("status").notNull().default("Queued"),
  nextFencingToken: bigint("next_fencing_token", { mode: "number" }).notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
})
export const agentJournal = pgTable("agent_journal", {
  cursor: bigint("cursor", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  runId: uuid("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  event: jsonb("event").notNull(),
}, (table) => [uniqueIndex("agent_journal_run_sequence_uidx").on(table.runId, table.sequence), index("agent_journal_cursor_idx").on(table.cursor)])
export const agentCheckpoints = pgTable("agent_checkpoints", { runId: uuid("run_id").primaryKey().references(() => agentRuns.id, { onDelete: "cascade" }), checkpoint: jsonb("checkpoint").notNull() })
export const agentRunClaims = pgTable("agent_run_claims", {
  runId: uuid("run_id").primaryKey().references(() => agentRuns.id, { onDelete: "cascade" }), ownerId: text("owner_id").notNull(), fencingToken: bigint("fencing_token", { mode: "number" }).notNull(), leaseExpiresAt: bigint("lease_expires_at", { mode: "number" }).notNull(),
}, (table) => [index("agent_run_claims_lease_idx").on(table.leaseExpiresAt)])
export const agentSessions = pgTable("agent_sessions", { id: uuid("id").primaryKey(), record: jsonb("record").notNull() })
export const agentSessionEntries = pgTable("agent_session_entries", {
  id: uuid("id").primaryKey(), sessionId: uuid("session_id").notNull().references(() => agentSessions.id, { onDelete: "cascade" }), entry: jsonb("entry").notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [index("agent_session_entries_session_idx").on(table.sessionId)])

export type FeatureFlagSnapshotRow = typeof featureFlagSnapshots.$inferSelect
export type StudyAssetRow = typeof studyAssets.$inferSelect
export type StudyNodeRow = typeof studyNodes.$inferSelect
export type StudyEdgeRow = typeof studyEdges.$inferSelect
