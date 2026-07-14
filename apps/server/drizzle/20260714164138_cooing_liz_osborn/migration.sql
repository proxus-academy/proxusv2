CREATE TABLE "study_edges" (
	"id" uuid PRIMARY KEY,
	"kind" text NOT NULL,
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_nodes" (
	"id" uuid PRIMARY KEY,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "study_edges_kind_from_to_uidx" ON "study_edges" ("kind","from_node_id","to_node_id");--> statement-breakpoint
CREATE INDEX "study_edges_from_idx" ON "study_edges" ("from_node_id");--> statement-breakpoint
CREATE INDEX "study_edges_to_idx" ON "study_edges" ("to_node_id");--> statement-breakpoint
CREATE INDEX "study_nodes_kind_idx" ON "study_nodes" ("kind");--> statement-breakpoint
CREATE INDEX "study_nodes_status_idx" ON "study_nodes" ("status");--> statement-breakpoint
ALTER TABLE "study_edges" ADD CONSTRAINT "study_edges_from_node_id_study_nodes_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "study_nodes"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "study_edges" ADD CONSTRAINT "study_edges_to_node_id_study_nodes_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "study_nodes"("id") ON DELETE RESTRICT;