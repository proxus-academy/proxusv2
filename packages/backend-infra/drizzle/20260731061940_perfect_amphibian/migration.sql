ALTER TABLE "users" DROP CONSTRAINT "users_validated_node_ids_check";--> statement-breakpoint
DROP INDEX "users_validated_node_ids_gin_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "study_id" uuid;--> statement-breakpoint
UPDATE "users" SET "study_id" = ("validated_node_ids" ->> 3)::uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "study_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "validated_node_ids";--> statement-breakpoint
CREATE INDEX "users_study_id_idx" ON "users" ("study_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_study_id_study_nodes_id_fkey" FOREIGN KEY ("study_id") REFERENCES "study_nodes"("id") ON DELETE RESTRICT;
