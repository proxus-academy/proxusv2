CREATE TABLE "agent_checkpoints" (
	"run_id" uuid PRIMARY KEY,
	"checkpoint" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_journal" (
	"cursor" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_journal_cursor_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_claims" (
	"run_id" uuid PRIMARY KEY,
	"owner_id" text NOT NULL,
	"fencing_token" bigint NOT NULL,
	"lease_expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY,
	"record" jsonb NOT NULL,
	"status" text DEFAULT 'Queued' NOT NULL,
	"next_fencing_token" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_session_entries" (
	"id" uuid PRIMARY KEY,
	"session_id" uuid NOT NULL,
	"entry" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY,
	"record" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_journal_run_sequence_uidx" ON "agent_journal" ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "agent_journal_cursor_idx" ON "agent_journal" ("cursor");--> statement-breakpoint
CREATE INDEX "agent_run_claims_lease_idx" ON "agent_run_claims" ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "agent_session_entries_session_idx" ON "agent_session_entries" ("session_id");--> statement-breakpoint
ALTER TABLE "agent_checkpoints" ADD CONSTRAINT "agent_checkpoints_run_id_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_journal" ADD CONSTRAINT "agent_journal_run_id_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_run_claims" ADD CONSTRAINT "agent_run_claims_run_id_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_session_entries" ADD CONSTRAINT "agent_session_entries_session_id_agent_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE;