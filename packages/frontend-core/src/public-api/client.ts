import { PublicApi } from "@proxus/shared/public-api"
import { Context, Layer } from "effect"
import { HttpApiClient } from "effect/unstable/httpapi"

export class PublicApiClient extends Context.Service<
  PublicApiClient,
  HttpApiClient.ForApi<typeof PublicApi>
>()("@proxus/frontend-core/public-api/client/PublicApiClient") {}

/**
 * Builds the typed public client from application-owned transport configuration.
 * Each composition root selects its base URL and provides the concrete HttpClient.
 */
export const makePublicApiClientLayer = (baseUrl: string) =>
  Layer.effect(PublicApiClient, HttpApiClient.make(PublicApi, { baseUrl }))
