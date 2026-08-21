import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

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
    check("feature_flag_snapshots_revision_wire_range_check", sql`${table.configurationRevision} between 1 and 9007199254740991`),
  ],
)

export type FeatureFlagSnapshotRow = typeof featureFlagSnapshots.$inferSelect
