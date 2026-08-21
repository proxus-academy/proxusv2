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

export const conversationThreads = pgTable(
  "conversation_threads",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    nextMessageSequence: bigint("next_message_sequence", { mode: "bigint" }).notNull().default(1n),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("conversation_threads_owner_updated_idx").on(table.ownerId, table.updatedAt, table.id),
    check("conversation_threads_title_check", sql`length(${table.title}) between 1 and 200`),
    check("conversation_threads_next_sequence_check", sql`${table.nextMessageSequence} > 0`),
  ],
)

export const conversationAgentRuns = pgTable(
  "conversation_agent_runs",
  {
    id: uuid("id").primaryKey(),
    threadId: uuid("thread_id").notNull().references(() => conversationThreads.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "running", "completed", "interrupted", "failed"] }).notNull(),
    agentVersion: text("agent_version").notNull(),
    maximumTurns: integer("maximum_turns").notNull(),
    maximumToolCalls: integer("maximum_tool_calls").notNull(),
    stopReason: text("stop_reason"),
    errorCode: text("error_code"),
    interruptedBy: text("interrupted_by", { enum: ["user", "admin", "system"] }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("conversation_agent_runs_thread_created_idx").on(table.threadId, table.createdAt),
    index("conversation_agent_runs_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("conversation_agent_runs_one_active_uidx")
      .on(table.threadId)
      .where(sql`${table.status} in ('queued', 'running')`),
    check("conversation_agent_runs_status_check", sql`${table.status} in ('queued', 'running', 'completed', 'interrupted', 'failed')`),
    check("conversation_agent_runs_limits_check", sql`${table.maximumTurns} > 0 and ${table.maximumToolCalls} >= 0`),
  ],
)

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey(),
    threadId: uuid("thread_id").notNull().references(() => conversationThreads.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => conversationAgentRuns.id, { onDelete: "set null" }),
    role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    status: text("status", { enum: ["committed", "streaming", "completed", "interrupted", "failed"] }).notNull(),
    text: text("text"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("conversation_messages_thread_sequence_uidx").on(table.threadId, table.sequence),
    index("conversation_messages_thread_created_idx").on(table.threadId, table.createdAt),
    index("conversation_messages_run_idx").on(table.runId),
    check("conversation_messages_role_check", sql`${table.role} in ('user', 'assistant', 'tool')`),
    check("conversation_messages_status_check", sql`${table.status} in ('committed', 'streaming', 'completed', 'interrupted', 'failed')`),
    check("conversation_messages_sequence_check", sql`${table.sequence} > 0`),
  ],
)

export const agentTurns = pgTable(
  "agent_turns",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id").notNull().references(() => conversationAgentRuns.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    status: text("status", { enum: ["running", "completed", "failed", "interrupted"] }).notNull(),
    decision: text("decision", { enum: ["respond", "tools", "stop"] }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("agent_turns_run_ordinal_uidx").on(table.runId, table.ordinal),
    check("agent_turns_ordinal_check", sql`${table.ordinal} > 0`),
    check("agent_turns_status_check", sql`${table.status} in ('running', 'completed', 'failed', 'interrupted')`),
  ],
)

export const modelGenerations = pgTable(
  "model_generations",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id").notNull().references(() => conversationAgentRuns.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id").notNull().references(() => agentTurns.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    retryOfGenerationId: uuid("retry_of_generation_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    providerRequestId: text("provider_request_id"),
    status: text("status", { enum: ["running", "completed", "failed", "interrupted"] }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    costMicrosUsd: bigint("cost_micros_usd", { mode: "bigint" }),
    usageSource: text("usage_source", { enum: ["provider", "estimated"] }),
    finishReason: text("finish_reason"),
    errorCode: text("error_code"),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    firstTokenAt: timestamp("first_token_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("model_generations_turn_attempt_uidx").on(table.turnId, table.attempt),
    index("model_generations_run_idx").on(table.runId),
    index("model_generations_provider_model_created_idx").on(table.provider, table.model, table.createdAt),
    check("model_generations_attempt_check", sql`${table.attempt} > 0`),
    check("model_generations_status_check", sql`${table.status} in ('running', 'completed', 'failed', 'interrupted')`),
    check("model_generations_usage_check", sql`coalesce(${table.inputTokens}, 0) >= 0 and coalesce(${table.outputTokens}, 0) >= 0 and coalesce(${table.cachedInputTokens}, 0) >= 0 and coalesce(${table.costMicrosUsd}, 0) >= 0`),
  ],
)

export const toolExecutions = pgTable(
  "tool_executions",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id").notNull().references(() => conversationAgentRuns.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id").notNull().references(() => agentTurns.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status", { enum: ["running", "completed", "failed", "interrupted"] }).notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("tool_executions_run_call_uidx").on(table.runId, table.toolCallId),
    index("tool_executions_turn_idx").on(table.turnId),
    check("tool_executions_status_check", sql`${table.status} in ('running', 'completed', 'failed', 'interrupted')`),
  ],
)

export const aiObservationPayloads = pgTable(
  "ai_observation_payloads",
  {
    id: uuid("id").primaryKey(),
    generationId: uuid("generation_id").references(() => modelGenerations.id, { onDelete: "cascade" }),
    toolExecutionId: uuid("tool_execution_id").references(() => toolExecutions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["generation-input", "generation-output", "tool-input", "tool-output"] }).notNull(),
    storageKey: text("storage_key").notNull(),
    status: text("status", { enum: ["pending", "available", "failed", "expired"] }).notNull(),
    schemaVersion: integer("schema_version").notNull(),
    redactionVersion: integer("redaction_version").notNull(),
    contentLength: bigint("content_length", { mode: "bigint" }),
    sha256: text("sha256"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("ai_observation_payloads_storage_key_uidx").on(table.storageKey),
    index("ai_observation_payloads_generation_idx").on(table.generationId),
    index("ai_observation_payloads_tool_idx").on(table.toolExecutionId),
    check("ai_observation_payloads_owner_check", sql`(${table.generationId} is not null)::int + (${table.toolExecutionId} is not null)::int = 1`),
    check("ai_observation_payloads_status_check", sql`${table.status} in ('pending', 'available', 'failed', 'expired')`),
    check("ai_observation_payloads_version_check", sql`${table.schemaVersion} > 0 and ${table.redactionVersion} > 0`),
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

export type UserRow = typeof users.$inferSelect
export type AuthSessionRow = typeof authSessions.$inferSelect
export type AuthChallengeRow = typeof authChallenges.$inferSelect
export type RoleAssignmentRow = typeof roleAssignments.$inferSelect
export type FeatureFlagSnapshotRow = typeof featureFlagSnapshots.$inferSelect
export type StudyAssetRow = typeof studyAssets.$inferSelect
export type StudyNodeRow = typeof studyNodes.$inferSelect
export type StudyEdgeRow = typeof studyEdges.$inferSelect
export type ProductAnalyticsEventRow = typeof productAnalyticsEvents.$inferSelect
export type ConversationThreadRow = typeof conversationThreads.$inferSelect
export type ConversationMessageRow = typeof conversationMessages.$inferSelect
export type ConversationAgentRunRow = typeof conversationAgentRuns.$inferSelect
export type AgentTurnRow = typeof agentTurns.$inferSelect
export type ModelGenerationRow = typeof modelGenerations.$inferSelect
export type ToolExecutionRow = typeof toolExecutions.$inferSelect
export type AiObservationPayloadRow = typeof aiObservationPayloads.$inferSelect
