import { ProductAnalyticsRepository, ProductAnalyticsRepositoryError } from "@proxus/backend-domain/product-analytics"
import { PublicProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { DateTime, Effect, Schema } from "effect"
import { productAnalyticsEvents } from "../../database/schema.js"

type Database = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>

const instant = (value: string) => DateTime.toDateUtc(DateTime.makeUnsafe(value))
const encodeEvent = Schema.encodeSync(PublicProductAnalyticsEvent)

export const makeProductAnalyticsRepositoryDrizzle = (db: Database) => ProductAnalyticsRepository.of({
  writeBatch: (batch) => db.insert(productAnalyticsEvents).values(batch.map((envelope) => ({
    eventId: envelope.eventId,
    receivedAt: instant(envelope.receivedAt),
    occurredAt: envelope.occurredAt === undefined ? null : instant(envelope.occurredAt),
    subjectId: envelope.subjectId,
    sessionId: envelope.sessionId ?? null,
    eventType: envelope.event._tag,
    flagKey: envelope.flagKey,
    variant: envelope.variant,
    revision: BigInt(envelope.revision),
    payload: encodeEvent(envelope.event),
  }))).onConflictDoNothing({ target: productAnalyticsEvents.eventId }).pipe(
    Effect.asVoid,
    Effect.mapError((cause) => new ProductAnalyticsRepositoryError({
      operation: "insert",
      // Event ids make retrying an interrupted insert idempotent.
      retryable: true,
      cause,
    })),
  ),
})
