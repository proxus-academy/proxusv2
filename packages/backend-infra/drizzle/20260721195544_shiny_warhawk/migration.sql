CREATE TABLE "agent_trace_payloads" (
	"trace_id" text PRIMARY KEY,
	"span_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"turn" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"capture_status" text NOT NULL,
	"started_at" bigint NOT NULL,
	"completed_at" bigint,
	"duration_ms" bigint,
	"input_tokens" integer,
	"output_tokens" integer,
	"artifact_id" uuid,
	"payload_sha256" text,
	"payload_bytes" integer,
	"content_type" text,
	"content_encoding" text,
	"schema_version" integer NOT NULL,
	"redaction_version" integer NOT NULL,
	"expires_at" bigint,
	"capture_error_category" text
);
--> statement-breakpoint
CREATE INDEX "agent_trace_payloads_run_started_idx" ON "agent_trace_payloads" ("run_id","started_at");--> statement-breakpoint
ALTER TABLE "agent_trace_payloads" ADD CONSTRAINT "agent_trace_payloads_run_id_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE;