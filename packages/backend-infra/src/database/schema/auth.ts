import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { studyNodes } from "./study-catalog.js"

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

export type UserRow = typeof users.$inferSelect
export type AuthSessionRow = typeof authSessions.$inferSelect
export type AuthChallengeRow = typeof authChallenges.$inferSelect
