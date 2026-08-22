CREATE TABLE "ugc_program_configurations" (
	"market" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"data_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ugc_program_configurations_market_check" CHECK ("market" ~ '^[A-Z]{2}$'),
	CONSTRAINT "ugc_program_configurations_versions_check" CHECK ("data_version" > 0 and "version" > 0)
);
--> statement-breakpoint
ALTER TABLE "ugc_payments" RENAME COLUMN "creator_id" TO "related_creator_id";--> statement-breakpoint
DROP INDEX "ugc_payments_creator_campaign_uidx";--> statement-breakpoint
ALTER TABLE "ugc_group_members" ADD COLUMN "agreement_terms_key" text;--> statement-breakpoint
UPDATE "ugc_group_members" SET "agreement_terms_key" = 'legacy:' || "id"::text;--> statement-breakpoint
ALTER TABLE "ugc_group_members" ALTER COLUMN "agreement_terms_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_payments" ADD COLUMN "recipient_user_id" uuid;--> statement-breakpoint
ALTER TABLE "ugc_payments" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "ugc_payments" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "ugc_payments" ADD COLUMN "currency" text;--> statement-breakpoint
UPDATE "ugc_payments" SET
	"recipient_user_id" = "related_creator_id",
	"kind" = 'creator_campaign',
	"source_key" = 'creator-campaign:' || "campaign_id"::text || ':' || "related_creator_id"::text,
	"currency" = 'EUR';--> statement-breakpoint
ALTER TABLE "ugc_payments" ALTER COLUMN "recipient_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_payments" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_payments" ALTER COLUMN "source_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_payments" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_payments" ALTER COLUMN "related_creator_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_payments" ALTER COLUMN "campaign_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "ugc_campaigns" SET "data" = "data" || jsonb_build_object(
	'contractPolicy', jsonb_build_object('contentRetentionMonths', 3, 'creatorNoticeDays', 5, 'paidMediaRightsAmountCents', 3000, 'paidMediaRightsDurationMonths', 3, 'exclusivityRequired', true),
	'requiredPlatforms', jsonb_build_array('tiktok', 'instagram'),
	'managerIncentives', jsonb_build_object('fixedPercentBasisPoints', 500, 'viewsBonusPercentBasisPoints', 500, 'rankingBonusPercentBasisPoints', 500, 'referralBonusPercentBasisPoints', 0, 'manualAdjustmentPercentBasisPoints', 0, 'outboundTrialPassBonusCents', CASE WHEN "data"->>'currency' = 'USD' THEN 1500 ELSE 2000 END)
);--> statement-breakpoint
UPDATE "ugc_users" SET "data" = "data" || jsonb_build_object('contracts', jsonb_build_array(), 'acquisition', jsonb_build_object('source', 'inbound', 'outboundManagerId', null)) WHERE "data"->>'_tag' = 'CreatorData';--> statement-breakpoint
UPDATE "ugc_users" SET "data" = jsonb_set("data", '{previousCreatorData}', ("data"->'previousCreatorData') || jsonb_build_object('contracts', jsonb_build_array(), 'acquisition', jsonb_build_object('source', 'inbound', 'outboundManagerId', null))) WHERE "data"->>'_tag' = 'TerminalData' AND "data"->'previousCreatorData' IS NOT NULL AND jsonb_typeof("data"->'previousCreatorData') <> 'null';--> statement-breakpoint
UPDATE "ugc_users" SET "data" = "data" || jsonb_build_object('outboundManagerId', null) WHERE "data"->>'_tag' = 'ApplicantData' AND NOT ("data" ? 'outboundManagerId');--> statement-breakpoint
UPDATE "ugc_users" SET "data" = "data" || jsonb_build_object('acquisition', jsonb_build_object('source', 'inbound', 'outboundManagerId', null)) WHERE "data"->>'_tag' = 'OnboardingData' AND NOT ("data" ? 'acquisition');--> statement-breakpoint
UPDATE "ugc_users" SET "data" = jsonb_set("data", '{contract}', ("data"->'contract') || jsonb_build_object(
	'scope', 'trial', 'campaignId', null, 'termsKey', 'legacy-trial:' || "id"::text,
	'terms', jsonb_build_object(
		'contentTarget', 8, 'compensationCents', CASE WHEN "country_code" = 'ES' THEN 7200 ELSE 5600 END,
		'currency', CASE WHEN "country_code" = 'ES' THEN 'EUR' ELSE 'USD' END,
		'formats', jsonb_build_array('testimonial', 'review', 'routine'), 'requiredPlatforms', jsonb_build_array('tiktok', 'instagram'), 'bonusRules', jsonb_build_array(),
		'maxVideosPerDay', 2, 'minVideosPerWeek', CASE WHEN "country_code" = 'ES' THEN 1 ELSE 3 END,
		'contractPolicy', jsonb_build_object('contentRetentionMonths', 3, 'creatorNoticeDays', 5, 'paidMediaRightsAmountCents', 3000, 'paidMediaRightsDurationMonths', 3, 'exclusivityRequired', true)
	)
)) WHERE "data"->>'_tag' = 'OnboardingData' AND "data"->'contract' IS NOT NULL AND jsonb_typeof("data"->'contract') <> 'null' AND NOT (("data"->'contract') ? 'terms');--> statement-breakpoint
UPDATE "ugc_users" SET "data" = "data" || jsonb_build_object(
	'completionCompensationCents', CASE WHEN "country_code" = 'ES' THEN 7200 ELSE 5600 END,
	'currency', CASE WHEN "country_code" = 'ES' THEN 'EUR' ELSE 'USD' END,
	'maxVideosPerDay', 2, 'minVideosPerWeek', CASE WHEN "country_code" = 'ES' THEN 1 ELSE 3 END,
	'allowedFormats', jsonb_build_array('testimonial', 'review', 'routine'), 'requiredPlatforms', jsonb_build_array('tiktok', 'instagram'),
	'outboundTrialPassBonusCents', CASE WHEN "country_code" = 'ES' THEN 2000 ELSE 1500 END,
	'acquisition', jsonb_build_object('source', 'inbound', 'outboundManagerId', null)
) WHERE "data"->>'_tag' = 'TrialData';--> statement-breakpoint
UPDATE "ugc_users" SET "data" = jsonb_set("data", '{contract}', ("data"->'contract') || jsonb_build_object(
	'scope', 'trial', 'campaignId', null, 'termsKey', 'legacy-trial:' || "id"::text,
	'terms', jsonb_build_object(
		'contentTarget', COALESCE(("data"->>'requiredVideoCount')::integer, 8), 'compensationCents', CASE WHEN "country_code" = 'ES' THEN 7200 ELSE 5600 END,
		'currency', CASE WHEN "country_code" = 'ES' THEN 'EUR' ELSE 'USD' END,
		'formats', jsonb_build_array('testimonial', 'review', 'routine'), 'requiredPlatforms', jsonb_build_array('tiktok', 'instagram'), 'bonusRules', jsonb_build_array(),
		'maxVideosPerDay', 2, 'minVideosPerWeek', CASE WHEN "country_code" = 'ES' THEN 1 ELSE 3 END,
		'contractPolicy', jsonb_build_object('contentRetentionMonths', 3, 'creatorNoticeDays', 5, 'paidMediaRightsAmountCents', 3000, 'paidMediaRightsDurationMonths', 3, 'exclusivityRequired', true)
	)
)) WHERE "data"->>'_tag' = 'TrialData' AND NOT (("data"->'contract') ? 'terms');--> statement-breakpoint
UPDATE "ugc_users" SET "data" = "data" || jsonb_build_object('contracts', jsonb_build_array("data"->'contract')) WHERE "data"->>'_tag' = 'TrialData';--> statement-breakpoint
UPDATE "ugc_users" SET "data" = "data" || jsonb_build_object(
	'historyAvailableUntil', to_char("updated_at" + interval '90 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
	'profile', COALESCE("data"->'previousCreatorData'->'profile', 'null'::jsonb),
	'contracts', COALESCE("data"->'previousCreatorData'->'contracts', '[]'::jsonb)
) WHERE "data"->>'_tag' = 'TerminalData';--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_payments_source_key_uidx" ON "ugc_payments" ("source_key");--> statement-breakpoint
CREATE INDEX "ugc_payments_recipient_idx" ON "ugc_payments" ("recipient_user_id");--> statement-breakpoint
ALTER TABLE "ugc_payments" ADD CONSTRAINT "ugc_payments_recipient_user_id_ugc_users_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "ugc_users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ugc_payments" ADD CONSTRAINT "ugc_payments_kind_check" CHECK ("kind" in ('trial_compensation','creator_campaign','manager_campaign_commission','manager_outbound_conversion'));--> statement-breakpoint
ALTER TABLE "ugc_group_members" DROP CONSTRAINT "ugc_group_members_status_check", ADD CONSTRAINT "ugc_group_members_status_check" CHECK ("status" in ('awaiting_contract','scheduled','active','completed','removed'));
