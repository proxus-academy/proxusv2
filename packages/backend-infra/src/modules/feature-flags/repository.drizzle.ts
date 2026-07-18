import { FeatureFlagSnapshotRepository, FeatureFlagSnapshotRepositoryError } from "@proxus/backend-domain/feature-flags"
import { FeatureFlagSnapshot, MaximumConfigurationRevision } from "@proxus/shared/feature-flags"
import { desc, eq, sql } from "drizzle-orm"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Effect, Schema } from "effect"
import { featureFlagSnapshots } from "../../database/schema.js"

type Database = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>

const revisionToNumber = (revision: bigint) => {
  if (revision < 0n || revision > BigInt(MaximumConfigurationRevision)) {
    throw new RangeError("feature flag configuration revision is outside the lossless wire range")
  }
  return Number(revision)
}

export const makeFeatureFlagSnapshotRepositoryDrizzle = (db: Database) => FeatureFlagSnapshotRepository.of({
  readActive: () => db.select().from(featureFlagSnapshots)
    .where(eq(featureFlagSnapshots.active, true))
    .orderBy(desc(featureFlagSnapshots.configurationRevision))
    .limit(1)
    .pipe(
      Effect.mapError((cause) => new FeatureFlagSnapshotRepositoryError({ operation: "readActive", cause })),
      Effect.flatMap((rows) => {
        if (rows.length === 0) return Effect.succeed(null)
        return Effect.try({
          try: () => revisionToNumber(rows[0]!.configurationRevision),
          catch: (cause) => new FeatureFlagSnapshotRepositoryError({ operation: "readActive", cause }),
        }).pipe(
          Effect.flatMap((configurationRevision) =>
            Schema.decodeUnknownEffect(FeatureFlagSnapshot)({
              configurationRevision,
              flags: rows[0]!.configuration,
            }).pipe(
              Effect.mapError((cause) => new FeatureFlagSnapshotRepositoryError({ operation: "readActive", cause })),
            ),
          ),
        )
      }),
    ),
  publish: (snapshot) => db.transaction((tx) => Effect.gen(function*() {
    // Serializes publishers even when no active row exists. Readers still observe either
    // the old committed revision or the complete new one, never the intermediate state.
    yield* tx.execute(sql`lock table ${featureFlagSnapshots} in share row exclusive mode`)
    yield* tx.update(featureFlagSnapshots).set({ active: false }).where(eq(featureFlagSnapshots.active, true))
    yield* tx.insert(featureFlagSnapshots).values({
      configurationRevision: BigInt(snapshot.configurationRevision),
      configuration: snapshot.flags,
      active: true,
    })
  })).pipe(
    Effect.mapError((cause) => new FeatureFlagSnapshotRepositoryError({ operation: "publish", cause })),
  ),
})
