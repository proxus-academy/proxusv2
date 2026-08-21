CREATE TABLE "agent_turns" (
	"id" uuid PRIMARY KEY,
	"run_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"status" text NOT NULL,
	"decision" text,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_turns_ordinal_check" CHECK ("ordinal" > 0),
	CONSTRAINT "agent_turns_status_check" CHECK ("status" in ('running', 'completed', 'failed', 'interrupted'))
);
--> statement-breakpoint
CREATE TABLE "ai_observation_payloads" (
	"id" uuid PRIMARY KEY,
	"generation_id" uuid,
	"tool_execution_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" text NOT NULL,
	"schema_version" integer NOT NULL,
	"redaction_version" integer NOT NULL,
	"content_length" bigint,
	"sha256" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "ai_observation_payloads_owner_check" CHECK (("generation_id" is not null)::int + ("tool_execution_id" is not null)::int = 1),
	CONSTRAINT "ai_observation_payloads_status_check" CHECK ("status" in ('pending', 'available', 'failed', 'expired')),
	CONSTRAINT "ai_observation_payloads_version_check" CHECK ("schema_version" > 0 and "redaction_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "conversation_agent_runs" (
	"id" uuid PRIMARY KEY,
	"thread_id" uuid NOT NULL,
	"status" text NOT NULL,
	"agent_version" text NOT NULL,
	"maximum_turns" integer NOT NULL,
	"maximum_tool_calls" integer NOT NULL,
	"stop_reason" text,
	"error_code" text,
	"interrupted_by" text,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"trace_id" text,
	"span_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "conversation_agent_runs_status_check" CHECK ("status" in ('queued', 'running', 'completed', 'interrupted', 'failed')),
	CONSTRAINT "conversation_agent_runs_limits_check" CHECK ("maximum_turns" > 0 and "maximum_tool_calls" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY,
	"thread_id" uuid NOT NULL,
	"run_id" uuid,
	"role" text NOT NULL,
	"sequence" bigint NOT NULL,
	"status" text NOT NULL,
	"text" text,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "conversation_messages_role_check" CHECK ("role" in ('user', 'assistant', 'tool')),
	CONSTRAINT "conversation_messages_status_check" CHECK ("status" in ('committed', 'streaming', 'completed', 'interrupted', 'failed')),
	CONSTRAINT "conversation_messages_sequence_check" CHECK ("sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "conversation_threads" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"next_message_sequence" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "conversation_threads_title_check" CHECK (length("title") between 1 and 200),
	CONSTRAINT "conversation_threads_next_sequence_check" CHECK ("next_message_sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "model_generations" (
	"id" uuid PRIMARY KEY,
	"run_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"retry_of_generation_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"provider_request_id" text,
	"status" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"cost_micros_usd" bigint,
	"usage_source" text,
	"finish_reason" text,
	"error_code" text,
	"trace_id" text,
	"span_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"first_token_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "model_generations_attempt_check" CHECK ("attempt" > 0),
	CONSTRAINT "model_generations_status_check" CHECK ("status" in ('running', 'completed', 'failed', 'interrupted')),
	CONSTRAINT "model_generations_usage_check" CHECK (coalesce("input_tokens", 0) >= 0 and coalesce("output_tokens", 0) >= 0 and coalesce("cached_input_tokens", 0) >= 0 and coalesce("cost_micros_usd", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "tool_executions" (
	"id" uuid PRIMARY KEY,
	"run_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "tool_executions_status_check" CHECK ("status" in ('running', 'completed', 'failed', 'interrupted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_run_ordinal_uidx" ON "agent_turns" ("run_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_observation_payloads_storage_key_uidx" ON "ai_observation_payloads" ("storage_key");--> statement-breakpoint
CREATE INDEX "ai_observation_payloads_generation_idx" ON "ai_observation_payloads" ("generation_id");--> statement-breakpoint
CREATE INDEX "ai_observation_payloads_tool_idx" ON "ai_observation_payloads" ("tool_execution_id");--> statement-breakpoint
CREATE INDEX "conversation_agent_runs_thread_created_idx" ON "conversation_agent_runs" ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_agent_runs_status_created_idx" ON "conversation_agent_runs" ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_agent_runs_one_active_uidx" ON "conversation_agent_runs" ("thread_id") WHERE "status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_thread_sequence_uidx" ON "conversation_messages" ("thread_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_messages_thread_created_idx" ON "conversation_messages" ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_run_idx" ON "conversation_messages" ("run_id");--> statement-breakpoint
CREATE INDEX "conversation_threads_owner_updated_idx" ON "conversation_threads" ("owner_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_generations_turn_attempt_uidx" ON "model_generations" ("turn_id","attempt");--> statement-breakpoint
CREATE INDEX "model_generations_run_idx" ON "model_generations" ("run_id");--> statement-breakpoint
CREATE INDEX "model_generations_provider_model_created_idx" ON "model_generations" ("provider","model","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_executions_run_call_uidx" ON "tool_executions" ("run_id","tool_call_id");--> statement-breakpoint
CREATE INDEX "tool_executions_turn_idx" ON "tool_executions" ("turn_id");--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_run_id_conversation_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "conversation_agent_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_observation_payloads" ADD CONSTRAINT "ai_observation_payloads_generation_id_model_generations_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "model_generations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_observation_payloads" ADD CONSTRAINT "ai_observation_payloads_fuN8mcTp7rjY_fkey" FOREIGN KEY ("tool_execution_id") REFERENCES "tool_executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_agent_runs" ADD CONSTRAINT "conversation_agent_runs_thread_id_conversation_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_thread_id_conversation_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_run_id_conversation_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "conversation_agent_runs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_generations" ADD CONSTRAINT "model_generations_run_id_conversation_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "conversation_agent_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_generations" ADD CONSTRAINT "model_generations_turn_id_agent_turns_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "agent_turns"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_run_id_conversation_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "conversation_agent_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_turn_id_agent_turns_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "agent_turns"("id") ON DELETE CASCADE;