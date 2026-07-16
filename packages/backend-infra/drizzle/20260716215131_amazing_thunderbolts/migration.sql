ALTER TABLE "feature_flag_snapshots" ADD CONSTRAINT "feature_flag_snapshots_revision_wire_range_check" CHECK ("configuration_revision" between 0 and 9007199254740991);
--> statement-breakpoint
CREATE FUNCTION prevent_feature_flag_snapshot_revision_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.configuration_revision IS DISTINCT FROM OLD.configuration_revision
    OR NEW.configuration IS DISTINCT FROM OLD.configuration
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'feature flag snapshot revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER feature_flag_snapshots_immutable_revision
BEFORE UPDATE ON "feature_flag_snapshots"
FOR EACH ROW EXECUTE FUNCTION prevent_feature_flag_snapshot_revision_mutation();