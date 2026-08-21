import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

/** Append-only product telemetry. It is not an audit or authorization source. */
export const productAnalyticsEvents = pgTable(
  "product_analytics_events",
  {
    eventId: uuid("event_id").primaryKey(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }),
    subjectId: uuid("subject_id").notNull(),
    sessionId: uuid("session_id"),
    eventType: text("event_type").notNull(),
    flagKey: text("flag_key").notNull(),
    variant: text("variant").notNull(),
    revision: bigint("revision", { mode: "bigint" }).notNull(),
    payload: jsonb("payload").notNull(),
  },
  (table) => [
    index("product_analytics_events_received_at_idx").on(table.receivedAt),
    index("product_analytics_events_subject_id_idx").on(table.subjectId),
    index("product_analytics_events_type_received_idx").on(table.eventType, table.receivedAt),
    check("product_analytics_events_revision_check", sql`${table.revision} between 0 and 9007199254740991`),
  ],
)

export type ProductAnalyticsEventRow = typeof productAnalyticsEvents.$inferSelect
