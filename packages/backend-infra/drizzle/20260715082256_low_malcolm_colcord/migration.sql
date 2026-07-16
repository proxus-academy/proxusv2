CREATE TABLE "study_assets" (
	"id" uuid PRIMARY KEY,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_nodes" ADD COLUMN "image_asset_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "study_assets_storage_key_uidx" ON "study_assets" ("storage_key");--> statement-breakpoint
ALTER TABLE "study_nodes" ADD CONSTRAINT "study_nodes_image_asset_id_study_assets_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "study_assets"("id") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "study_nodes" SET "kind" = 'university' WHERE "kind" = 'universities';--> statement-breakpoint
UPDATE "study_edges" SET "kind" = 'TypeUniversityEdge' WHERE "kind" = 'TypeUniversitiesEdge';--> statement-breakpoint
UPDATE "study_edges" SET "kind" = 'UniversityDegreeEdge' WHERE "kind" = 'UniversitiesDegreeEdge';