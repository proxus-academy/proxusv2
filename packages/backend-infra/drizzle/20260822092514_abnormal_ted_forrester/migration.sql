CREATE TABLE "ugc_campaigns" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"submissions_close_at" timestamp with time zone NOT NULL,
	"reconciliation_ends_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"data_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ugc_campaigns_status_check" CHECK ("status" in ('draft','published','finalized','cancelled','archived')),
	CONSTRAINT "ugc_campaigns_dates_check" CHECK ("starts_at" < "submissions_close_at" and "submissions_close_at" < "reconciliation_ends_at"),
	CONSTRAINT "ugc_campaigns_versions_check" CHECK ("data_version" > 0 and "version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ugc_group_members" (
	"id" uuid PRIMARY KEY,
	"group_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"tier_id" text NOT NULL,
	"status" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ugc_group_members_status_check" CHECK ("status" in ('scheduled','active','completed','removed'))
);
--> statement-breakpoint
CREATE TABLE "ugc_groups" (
	"id" uuid PRIMARY KEY,
	"campaign_id" uuid NOT NULL,
	"manager_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ugc_groups_status_check" CHECK ("status" in ('draft','active','completed','cancelled')),
	CONSTRAINT "ugc_groups_capacity_check" CHECK ("capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "ugc_meets" (
	"id" uuid PRIMARY KEY,
	"manager_id" uuid NOT NULL,
	"creator_id" uuid,
	"status" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ugc_meets_status_check" CHECK ("status" in ('available','reserved','attended','missed','cancelled')),
	CONSTRAINT "ugc_meets_reservation_check" CHECK (("status" = 'available' and "creator_id" is null) or ("status" <> 'available')),
	CONSTRAINT "ugc_meets_duration_check" CHECK ("duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "ugc_payments" (
	"id" uuid PRIMARY KEY,
	"creator_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ugc_payments_status_check" CHECK ("status" in ('pending','paid','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "ugc_users" (
	"id" uuid PRIMARY KEY,
	"auth_user_id" uuid,
	"user_type" text NOT NULL,
	"status" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"country_code" text NOT NULL,
	"data" jsonb NOT NULL,
	"data_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ugc_users_type_check" CHECK ("user_type" in ('creator', 'manager')),
	CONSTRAINT "ugc_users_status_check" CHECK ("status" in ('lead','applicant','onboarding','trial','creator','suspended','rejected','disqualified','exited','active','disabled')),
	CONSTRAINT "ugc_users_type_status_pair_check" CHECK (("user_type" = 'manager' and "status" in ('active','disabled')) or ("user_type" = 'creator' and "status" not in ('active','disabled'))),
	CONSTRAINT "ugc_users_email_check" CHECK ("email" = lower(btrim("email"))),
	CONSTRAINT "ugc_users_country_check" CHECK ("country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "ugc_users_versions_check" CHECK ("data_version" > 0 and "version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ugc_video_data" (
	"id" uuid PRIMARY KEY,
	"video_id" uuid NOT NULL,
	"tiktok_views" integer NOT NULL,
	"instagram_views" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "ugc_video_data_views_check" CHECK ("tiktok_views" >= 0 and "instagram_views" >= 0),
	CONSTRAINT "ugc_video_data_source_check" CHECK ("source" in ('mock','rapid-api','manual'))
);
--> statement-breakpoint
CREATE TABLE "ugc_videos" (
	"id" uuid PRIMARY KEY,
	"creator_id" uuid NOT NULL,
	"campaign_id" uuid,
	"status" text NOT NULL,
	"format" text NOT NULL,
	"reference" text NOT NULL,
	"tiktok_url" text,
	"instagram_url" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ugc_videos_status_check" CHECK ("status" in ('submitted','changes_requested','accepted','rejected','locked')),
	CONSTRAINT "ugc_videos_link_check" CHECK ("tiktok_url" is not null or "instagram_url" is not null)
);
--> statement-breakpoint
CREATE INDEX "ugc_campaigns_status_dates_idx" ON "ugc_campaigns" ("status","starts_at","submissions_close_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_group_members_group_creator_uidx" ON "ugc_group_members" ("group_id","creator_id");--> statement-breakpoint
CREATE INDEX "ugc_group_members_creator_idx" ON "ugc_group_members" ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_groups_campaign_name_uidx" ON "ugc_groups" ("campaign_id","name");--> statement-breakpoint
CREATE INDEX "ugc_groups_manager_idx" ON "ugc_groups" ("manager_id");--> statement-breakpoint
CREATE INDEX "ugc_meets_manager_starts_idx" ON "ugc_meets" ("manager_id","starts_at");--> statement-breakpoint
CREATE INDEX "ugc_meets_creator_idx" ON "ugc_meets" ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_payments_creator_campaign_uidx" ON "ugc_payments" ("creator_id","campaign_id");--> statement-breakpoint
CREATE INDEX "ugc_payments_status_idx" ON "ugc_payments" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_users_auth_user_id_uidx" ON "ugc_users" ("auth_user_id") WHERE "auth_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_users_email_uidx" ON "ugc_users" ("email");--> statement-breakpoint
CREATE INDEX "ugc_users_type_status_idx" ON "ugc_users" ("user_type","status");--> statement-breakpoint
CREATE INDEX "ugc_users_country_idx" ON "ugc_users" ("country_code");--> statement-breakpoint
CREATE INDEX "ugc_video_data_video_captured_idx" ON "ugc_video_data" ("video_id","captured_at");--> statement-breakpoint
CREATE INDEX "ugc_videos_creator_campaign_idx" ON "ugc_videos" ("creator_id","campaign_id");--> statement-breakpoint
CREATE INDEX "ugc_videos_status_idx" ON "ugc_videos" ("status");--> statement-breakpoint
ALTER TABLE "ugc_group_members" ADD CONSTRAINT "ugc_group_members_group_id_ugc_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "ugc_groups"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_group_members" ADD CONSTRAINT "ugc_group_members_creator_id_ugc_users_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "ugc_users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_groups" ADD CONSTRAINT "ugc_groups_campaign_id_ugc_campaigns_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ugc_campaigns"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_groups" ADD CONSTRAINT "ugc_groups_manager_id_ugc_users_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "ugc_users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_meets" ADD CONSTRAINT "ugc_meets_manager_id_ugc_users_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "ugc_users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_meets" ADD CONSTRAINT "ugc_meets_creator_id_ugc_users_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "ugc_users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_payments" ADD CONSTRAINT "ugc_payments_creator_id_ugc_users_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "ugc_users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_payments" ADD CONSTRAINT "ugc_payments_campaign_id_ugc_campaigns_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ugc_campaigns"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_users" ADD CONSTRAINT "ugc_users_auth_user_id_users_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ugc_video_data" ADD CONSTRAINT "ugc_video_data_video_id_ugc_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "ugc_videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ugc_videos" ADD CONSTRAINT "ugc_videos_creator_id_ugc_users_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "ugc_users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_videos" ADD CONSTRAINT "ugc_videos_campaign_id_ugc_campaigns_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ugc_campaigns"("id") ON DELETE RESTRICT;