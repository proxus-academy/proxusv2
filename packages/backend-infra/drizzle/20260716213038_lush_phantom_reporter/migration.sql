CREATE TABLE "feature_flag_snapshots" (
	"configuration_revision" bigint PRIMARY KEY,
	"configuration" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_snapshots_single_active_uidx" ON "feature_flag_snapshots" ("active") WHERE "active" = true;