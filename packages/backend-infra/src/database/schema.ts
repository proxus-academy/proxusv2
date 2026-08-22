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

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    emailNormalized: text("email_normalized").notNull(),
    status: text("status", { enum: ["pending", "active", "disabled"] }).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    passwordHash: text("password_hash"),
    googleSubject: text("google_subject"),
    usernameNormalized: text("username_normalized").notNull(),
    birthYear: integer("birth_year").notNull(),
    problemKind: text("problem_kind", { enum: [
      "understand-content",
      "prepare-exams",
      "organize-study",
      "choose-studies",
      "other",
    ] }).notNull(),
    problemOther: text("problem_other"),
    acquisitionSource: text("acquisition_source", { enum: [
      "friend", "tiktok", "instagram", "whatsapp", "google", "ai", "event", "other", "legacy",
    ] }).notNull(),
    acquisitionOther: text("acquisition_other"),
    studyId: uuid("study_id").notNull().references(() => studyNodes.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id").notNull().references(() => studyNodes.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("users_email_normalized_uidx").on(table.emailNormalized),
    uniqueIndex("users_username_normalized_uidx").on(table.usernameNormalized),
    uniqueIndex("users_google_subject_uidx").on(table.googleSubject).where(sql`${table.googleSubject} is not null`),
    index("users_study_id_idx").on(table.studyId),
    index("users_subject_id_idx").on(table.subjectId),
    check("users_email_normalized_check", sql`${table.emailNormalized} = lower(btrim(${table.emailNormalized})) and length(${table.emailNormalized}) <= 254 and ${table.emailNormalized} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`),
    check("users_username_normalized_check", sql`${table.usernameNormalized} = lower(${table.usernameNormalized}) and ${table.usernameNormalized} ~ '^[a-z0-9_]{3,30}$'`),
    check("users_google_subject_check", sql`${table.googleSubject} is null or (${table.googleSubject} = btrim(${table.googleSubject}) and length(${table.googleSubject}) between 1 and 255)`),
    check("users_status_check", sql`${table.status} in ('pending', 'active', 'disabled')`),
    check("users_problem_kind_check", sql`${table.problemKind} in ('understand-content', 'prepare-exams', 'organize-study', 'choose-studies', 'other')`),
    check("users_problem_other_check", sql`(${table.problemKind} = 'other' and length(btrim(${table.problemOther})) between 1 and 280) or (${table.problemKind} <> 'other' and ${table.problemOther} is null)`),
    check("users_acquisition_source_check", sql`${table.acquisitionSource} in ('friend', 'tiktok', 'instagram', 'whatsapp', 'google', 'ai', 'event', 'other', 'legacy')`),
    check("users_acquisition_other_check", sql`(${table.acquisitionSource} = 'other' and length(btrim(${table.acquisitionOther})) between 1 and 200) or (${table.acquisitionSource} <> 'other' and ${table.acquisitionOther} is null)`),
  ],
)

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    previousTokenHash: text("previous_token_hash"),
    previousTokenValidUntil: timestamp("previous_token_valid_until", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_uidx").on(table.tokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
    check("auth_sessions_token_hash_check", sql`length(${table.tokenHash}) > 0`),
    check("auth_sessions_previous_token_pair_check", sql`(${table.previousTokenHash} is null) = (${table.previousTokenValidUntil} is null)`),
  ],
)

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["verify-email", "reset-password"] }).notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    maximumAttempts: integer("maximum_attempts").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("auth_challenges_user_purpose_idx").on(table.userId, table.purpose),
    index("auth_challenges_expires_at_idx").on(table.expiresAt),
    check("auth_challenges_purpose_check", sql`${table.purpose} in ('verify-email', 'reset-password')`),
    check("auth_challenges_code_hash_check", sql`length(${table.codeHash}) > 0`),
    check("auth_challenges_attempts_check", sql`${table.maximumAttempts} > 0 and ${table.failedAttempts} between 0 and ${table.maximumAttempts}`),
  ],
)

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

export const ugcUsers = pgTable(
  "ugc_users",
  {
    id: uuid("id").primaryKey(),
    authUserId: uuid("auth_user_id").references(() => users.id, { onDelete: "set null" }),
    userType: text("user_type", { enum: ["creator", "manager"] }).notNull(),
    status: text("status").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    countryCode: text("country_code").notNull(),
    data: jsonb("data").notNull(),
    dataVersion: integer("data_version").notNull().default(1),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("ugc_users_auth_user_id_uidx").on(table.authUserId).where(sql`${table.authUserId} is not null`),
    uniqueIndex("ugc_users_email_uidx").on(table.email),
    index("ugc_users_type_status_idx").on(table.userType, table.status),
    index("ugc_users_country_idx").on(table.countryCode),
    check("ugc_users_type_check", sql`${table.userType} in ('creator', 'manager')`),
    check("ugc_users_status_check", sql`${table.status} in ('lead','applicant','onboarding','trial','creator','suspended','rejected','disqualified','exited','active','disabled')`),
    check("ugc_users_type_status_pair_check", sql`(${table.userType} = 'manager' and ${table.status} in ('active','disabled')) or (${table.userType} = 'creator' and ${table.status} not in ('active','disabled'))`),
    check("ugc_users_email_check", sql`${table.email} = lower(btrim(${table.email}))`),
    check("ugc_users_country_check", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
    check("ugc_users_versions_check", sql`${table.dataVersion} > 0 and ${table.version} > 0`),
  ],
)

export const ugcCampaigns = pgTable(
  "ugc_campaigns",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status", { enum: ["draft", "published", "finalized", "cancelled", "archived"] }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    submissionsCloseAt: timestamp("submissions_close_at", { withTimezone: true, mode: "date" }).notNull(),
    reconciliationEndsAt: timestamp("reconciliation_ends_at", { withTimezone: true, mode: "date" }).notNull(),
    data: jsonb("data").notNull(),
    dataVersion: integer("data_version").notNull().default(1),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("ugc_campaigns_status_dates_idx").on(table.status, table.startsAt, table.submissionsCloseAt),
    check("ugc_campaigns_status_check", sql`${table.status} in ('draft','published','finalized','cancelled','archived')`),
    check("ugc_campaigns_dates_check", sql`${table.startsAt} < ${table.submissionsCloseAt} and ${table.submissionsCloseAt} < ${table.reconciliationEndsAt}`),
    check("ugc_campaigns_versions_check", sql`${table.dataVersion} > 0 and ${table.version} > 0`),
  ],
)

export const ugcGroups = pgTable(
  "ugc_groups",
  {
    id: uuid("id").primaryKey(),
    campaignId: uuid("campaign_id").notNull().references(() => ugcCampaigns.id, { onDelete: "restrict" }),
    managerId: uuid("manager_id").notNull().references(() => ugcUsers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    status: text("status", { enum: ["draft", "active", "completed", "cancelled"] }).notNull(),
    capacity: integer("capacity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("ugc_groups_campaign_name_uidx").on(table.campaignId, table.name),
    index("ugc_groups_manager_idx").on(table.managerId),
    check("ugc_groups_status_check", sql`${table.status} in ('draft','active','completed','cancelled')`),
    check("ugc_groups_capacity_check", sql`${table.capacity} > 0`),
  ],
)

export const ugcGroupMembers = pgTable(
  "ugc_group_members",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id").notNull().references(() => ugcGroups.id, { onDelete: "restrict" }),
    creatorId: uuid("creator_id").notNull().references(() => ugcUsers.id, { onDelete: "restrict" }),
    tierId: text("tier_id").notNull(),
    status: text("status", { enum: ["scheduled", "active", "completed", "removed"] }).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("ugc_group_members_group_creator_uidx").on(table.groupId, table.creatorId),
    index("ugc_group_members_creator_idx").on(table.creatorId),
    check("ugc_group_members_status_check", sql`${table.status} in ('scheduled','active','completed','removed')`),
  ],
)

export const ugcMeets = pgTable(
  "ugc_meets",
  {
    id: uuid("id").primaryKey(),
    managerId: uuid("manager_id").notNull().references(() => ugcUsers.id, { onDelete: "restrict" }),
    creatorId: uuid("creator_id").references(() => ugcUsers.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["available", "reserved", "attended", "missed", "cancelled"] }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("ugc_meets_manager_starts_idx").on(table.managerId, table.startsAt),
    index("ugc_meets_creator_idx").on(table.creatorId),
    check("ugc_meets_status_check", sql`${table.status} in ('available','reserved','attended','missed','cancelled')`),
    check("ugc_meets_reservation_check", sql`(${table.status} = 'available' and ${table.creatorId} is null) or (${table.status} in ('reserved','attended','missed') and ${table.creatorId} is not null) or ${table.status} = 'cancelled'`),
    check("ugc_meets_duration_check", sql`${table.durationMinutes} > 0`),
  ],
)

export const ugcVideos = pgTable(
  "ugc_videos",
  {
    id: uuid("id").primaryKey(),
    creatorId: uuid("creator_id").notNull().references(() => ugcUsers.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id").references(() => ugcCampaigns.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["submitted", "changes_requested", "accepted", "rejected", "locked"] }).notNull(),
    format: text("format").notNull(),
    reference: text("reference").notNull(),
    tiktokUrl: text("tiktok_url"),
    instagramUrl: text("instagram_url"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" }).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("ugc_videos_creator_campaign_idx").on(table.creatorId, table.campaignId),
    index("ugc_videos_status_idx").on(table.status),
    check("ugc_videos_status_check", sql`${table.status} in ('submitted','changes_requested','accepted','rejected','locked')`),
    check("ugc_videos_link_check", sql`${table.tiktokUrl} is not null or ${table.instagramUrl} is not null`),
  ],
)

export const ugcVideoData = pgTable(
  "ugc_video_data",
  {
    id: uuid("id").primaryKey(),
    videoId: uuid("video_id").notNull().references(() => ugcVideos.id, { onDelete: "cascade" }),
    tiktokViews: integer("tiktok_views").notNull(),
    instagramViews: integer("instagram_views").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }).notNull(),
    source: text("source", { enum: ["mock", "rapid-api", "manual"] }).notNull(),
  },
  (table) => [
    index("ugc_video_data_video_captured_idx").on(table.videoId, table.capturedAt),
    check("ugc_video_data_views_check", sql`${table.tiktokViews} >= 0 and ${table.instagramViews} >= 0`),
    check("ugc_video_data_source_check", sql`${table.source} in ('mock','rapid-api','manual')`),
  ],
)

export const ugcPayments = pgTable(
  "ugc_payments",
  {
    id: uuid("id").primaryKey(),
    creatorId: uuid("creator_id").notNull().references(() => ugcUsers.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id").notNull().references(() => ugcCampaigns.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["pending", "paid", "cancelled"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    breakdown: jsonb("breakdown").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("ugc_payments_creator_campaign_uidx").on(table.creatorId, table.campaignId),
    index("ugc_payments_status_idx").on(table.status),
    check("ugc_payments_status_check", sql`${table.status} in ('pending','paid','cancelled')`),
  ],
)

export type UserRow = typeof users.$inferSelect
export type AuthSessionRow = typeof authSessions.$inferSelect
export type AuthChallengeRow = typeof authChallenges.$inferSelect
export type RoleAssignmentRow = typeof roleAssignments.$inferSelect
export type FeatureFlagSnapshotRow = typeof featureFlagSnapshots.$inferSelect
export type StudyAssetRow = typeof studyAssets.$inferSelect
export type StudyNodeRow = typeof studyNodes.$inferSelect
export type StudyEdgeRow = typeof studyEdges.$inferSelect
export type ProductAnalyticsEventRow = typeof productAnalyticsEvents.$inferSelect
export type UgcUserRow = typeof ugcUsers.$inferSelect
export type UgcCampaignRow = typeof ugcCampaigns.$inferSelect
export type UgcGroupRow = typeof ugcGroups.$inferSelect
export type UgcGroupMemberRow = typeof ugcGroupMembers.$inferSelect
export type UgcMeetRow = typeof ugcMeets.$inferSelect
export type UgcVideoRow = typeof ugcVideos.$inferSelect
export type UgcVideoDataRow = typeof ugcVideoData.$inferSelect
export type UgcPaymentRow = typeof ugcPayments.$inferSelect
