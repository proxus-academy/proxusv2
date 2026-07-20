DROP TRIGGER feature_flag_snapshots_immutable_revision ON "feature_flag_snapshots";
--> statement-breakpoint
DO $$
DECLARE
  migrated_revision bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "feature_flag_snapshots"
    WHERE "configuration_revision" = 0
  ) THEN
    SELECT max("configuration_revision") + 1
    INTO migrated_revision
    FROM "feature_flag_snapshots";

    IF migrated_revision > 9007199254740991 THEN
      RAISE EXCEPTION 'cannot migrate feature flag snapshot revision 0 inside the wire range';
    END IF;

    UPDATE "feature_flag_snapshots"
    SET "configuration_revision" = migrated_revision
    WHERE "configuration_revision" = 0;
  END IF;

  UPDATE "feature_flag_snapshots"
  SET "configuration" = "configuration" -> 'flags'
  WHERE jsonb_typeof("configuration") = 'object'
    AND "configuration" ? 'configurationRevision'
    AND "configuration" ? 'flags';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER feature_flag_snapshots_immutable_revision
BEFORE UPDATE ON "feature_flag_snapshots"
FOR EACH ROW EXECUTE FUNCTION prevent_feature_flag_snapshot_revision_mutation();
--> statement-breakpoint
ALTER TABLE "feature_flag_snapshots"
  DROP CONSTRAINT "feature_flag_snapshots_revision_wire_range_check",
  ADD CONSTRAINT "feature_flag_snapshots_revision_wire_range_check"
    CHECK ("configuration_revision" between 1 and 9007199254740991);
