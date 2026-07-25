CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_challenges_purpose_check" CHECK ("purpose" in ('verify-email', 'reset-password')),
	CONSTRAINT "auth_challenges_code_hash_check" CHECK (length("code_hash") > 0),
	CONSTRAINT "auth_challenges_attempts_check" CHECK ("maximum_attempts" > 0 and "failed_attempts" between 0 and "maximum_attempts")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"previous_token_hash" text,
	"previous_token_valid_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_check" CHECK (length("token_hash") > 0),
	CONSTRAINT "auth_sessions_previous_token_pair_check" CHECK (("previous_token_hash" is null) = ("previous_token_valid_until" is null))
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "role_assignments_role_check" CHECK ("role" in ('admin', 'catalog-editor', 'student')),
	CONSTRAINT "role_assignments_scope_type_check" CHECK ("scope_type" in ('studyCatalog', 'studyNode', 'studyEdge')),
	CONSTRAINT "role_assignments_scope_id_check" CHECK (length(btrim("scope_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY,
	"email_normalized" text NOT NULL,
	"status" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"google_subject" text,
	"username_normalized" text NOT NULL,
	"birth_year" integer NOT NULL,
	"problem_kind" text NOT NULL,
	"problem_other" text,
	"subject_id" uuid NOT NULL,
	"validated_node_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_normalized_check" CHECK ("email_normalized" = lower(btrim("email_normalized")) and length("email_normalized") <= 254 and "email_normalized" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
	CONSTRAINT "users_username_normalized_check" CHECK ("username_normalized" = lower("username_normalized") and "username_normalized" ~ '^[a-z0-9_]{3,30}$'),
	CONSTRAINT "users_google_subject_check" CHECK ("google_subject" is null or ("google_subject" = btrim("google_subject") and length("google_subject") between 1 and 255)),
	CONSTRAINT "users_status_check" CHECK ("status" in ('pending', 'active', 'disabled')),
	CONSTRAINT "users_problem_kind_check" CHECK ("problem_kind" in ('understand-content', 'prepare-exams', 'organize-study', 'choose-studies', 'other')),
	CONSTRAINT "users_problem_other_check" CHECK (("problem_kind" = 'other' and length(btrim("problem_other")) between 1 and 280) or ("problem_kind" <> 'other' and "problem_other" is null)),
	CONSTRAINT "users_validated_node_ids_check" CHECK (jsonb_typeof("validated_node_ids") = 'array' and jsonb_array_length("validated_node_ids") = 5)
);
--> statement-breakpoint
CREATE INDEX "auth_challenges_user_purpose_idx" ON "auth_challenges" ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_uidx" ON "auth_sessions" ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_assignment_uidx" ON "role_assignments" ("user_id","role","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "role_assignments_scope_idx" ON "role_assignments" ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "role_assignments_granted_by_idx" ON "role_assignments" ("granted_by");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_uidx" ON "users" ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_normalized_uidx" ON "users" ("username_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_subject_uidx" ON "users" ("google_subject") WHERE "google_subject" is not null;--> statement-breakpoint
CREATE INDEX "users_subject_id_idx" ON "users" ("subject_id");--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_granted_by_users_id_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_subject_id_study_nodes_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "study_nodes"("id") ON DELETE RESTRICT;