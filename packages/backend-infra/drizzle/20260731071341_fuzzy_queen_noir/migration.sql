ALTER TABLE "users" ADD COLUMN "acquisition_source" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_other" text;--> statement-breakpoint
UPDATE "users" SET "acquisition_source" = 'legacy';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "acquisition_source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_acquisition_source_check" CHECK ("acquisition_source" in ('friend', 'tiktok', 'instagram', 'whatsapp', 'google', 'ai', 'event', 'other', 'legacy'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_acquisition_other_check" CHECK (("acquisition_source" = 'other' and length(btrim("acquisition_other")) between 1 and 200) or ("acquisition_source" <> 'other' and "acquisition_other" is null));
