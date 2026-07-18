import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { MaximumConfigurationRevision } from "../feature-flags/api.js"

/** A hint to refetch GET /feature-flags/snapshot; never a snapshot or delivery guarantee. */
export class FeatureFlagSnapshotChanged extends Schema.TaggedClass<FeatureFlagSnapshotChanged>()(
  "FeatureFlagSnapshotChanged",
  { revision: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MaximumConfigurationRevision }))) },
) {}

/** Keeps intermediaries and idle connections alive; carries no application state. */
export class RealtimeHeartbeat extends Schema.TaggedClass<RealtimeHeartbeat>()("RealtimeHeartbeat", {}) {}

export const PublicRealtimeEvent = Schema.Union([FeatureFlagSnapshotChanged, RealtimeHeartbeat])
export type PublicRealtimeEvent = typeof PublicRealtimeEvent.Type

export class PublicRealtimeApi extends HttpApiGroup.make("realtime", { topLevel: true }).add(
  HttpApiEndpoint.get("events", "/realtime/events", {
    success: HttpApiSchema.StreamSse({ data: PublicRealtimeEvent }),
  }),
) {}
