import { FeatureFlagSnapshotRepository, FeatureFlagSnapshotRepositoryError } from "@proxus/backend-domain/feature-flags"
import {
  MaximumConfigurationRevision,
  PublishedFeatureFlagSnapshot,
} from "@proxus/shared/feature-flags"
import { desc, eq, sql } from "drizzle-orm"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Data, Effect, Option, Schema } from "effect"
import {
  featureFlagSnapshots,
  type FeatureFlagSnapshotRow,
} from "../../database/schema/feature-flags.js"

type Database = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>

class InvalidFeatureFlagSnapshotRevision extends Data.TaggedError(
  "InvalidFeatureFlagSnapshotRevision",
)<{ readonly revision: bigint }> {}

const revisionToNumber = (
  revision: bigint,
): Effect.Effect<number, InvalidFeatureFlagSnapshotRevision> => {
  if (revision < 1n || revision > BigInt(MaximumConfigurationRevision)) {
    return Effect.fail(new InvalidFeatureFlagSnapshotRevision({ revision }))
  }
  return Effect.succeed(Number(revision))
}

const decodeSnapshotRow = (row: FeatureFlagSnapshotRow) =>
  revisionToNumber(row.configurationRevision).pipe(
    Effect.flatMap((configurationRevision) =>
      Schema.decodeUnknownEffect(PublishedFeatureFlagSnapshot)({
        configurationRevision,
        flags: row.configuration,
      }),
    ),
  )

export const makeFeatureFlagSnapshotRepositoryDrizzle = (db: Database) => FeatureFlagSnapshotRepository.of({
  readActive: () => db.select().from(featureFlagSnapshots)
    .where(eq(featureFlagSnapshots.active, true))
    .orderBy(desc(featureFlagSnapshots.configurationRevision))
    .limit(1)
    .pipe(
      Effect.flatMap((rows) =>
        Option.fromIterable(rows).pipe(
          Option.match({
            onNone: () => Effect.succeed(null),
            onSome: decodeSnapshotRow,
          }),
        ),
      ),
      Effect.mapError((cause) =>
        new FeatureFlagSnapshotRepositoryError({ operation: "readActive", cause }),
      ),
    ),
  publish: (input) => Schema.decodeUnknownEffect(
    PublishedFeatureFlagSnapshot,
  )(input).pipe(
    Effect.flatMap((snapshot) => db.transaction((tx) => Effect.gen(function*() {
      // Serializes publishers even when no active row exists. Readers still observe either
      // the old committed revision or the complete new one, never the intermediate state.
      yield* tx.execute(
        sql`lock table ${featureFlagSnapshots} in share row exclusive mode`,
      )
      yield* tx
        .update(featureFlagSnapshots)
        .set({ active: false })
        .where(eq(featureFlagSnapshots.active, true))
      yield* tx.insert(featureFlagSnapshots).values({
        configurationRevision: BigInt(snapshot.configurationRevision),
        configuration: snapshot.flags,
        active: true,
      })
    }))),
    Effect.mapError((cause) => new FeatureFlagSnapshotRepositoryError({
      operation: "publish",
      cause,
    })),
  ),
})
