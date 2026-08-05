CREATE TABLE "product_analytics_events" (
	"event_id" uuid PRIMARY KEY,
	"received_at" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone,
	"subject_id" uuid NOT NULL,
	"session_id" uuid,
	"event_type" text NOT NULL,
	"flag_key" text NOT NULL,
	"variant" text NOT NULL,
	"revision" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "product_analytics_events_revision_check" CHECK ("revision" between 0 and 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX "product_analytics_events_received_at_idx" ON "product_analytics_events" ("received_at");--> statement-breakpoint
CREATE INDEX "product_analytics_events_subject_id_idx" ON "product_analytics_events" ("subject_id");--> statement-breakpoint
CREATE INDEX "product_analytics_events_type_received_idx" ON "product_analytics_events" ("event_type","received_at");