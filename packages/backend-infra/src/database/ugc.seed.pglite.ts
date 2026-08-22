import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect } from "effect"
import { seedUgcPreviewFixtures } from "./ugc.seed.js"

/** PGlite composition kept separate so the PostgreSQL preview bundle cannot retain PGlite. */
export const seedPgliteUgcPreviewFixtures = PgliteDrizzle.makeWithDefaults().pipe(
  Effect.flatMap(seedUgcPreviewFixtures),
)
