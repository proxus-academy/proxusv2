import { PublicApi } from "@proxus/shared/public-api"
import { Context, Effect, Layer } from "effect"
import { HttpApiClient } from "effect/unstable/httpapi"
import { PublicApiClient } from "../public-api/client.js"

type PublicClient = HttpApiClient.ForApi<typeof PublicApi>

export class PublicStudyCatalogClient extends Context.Service<
  PublicStudyCatalogClient,
  {
    readonly listRoots: () => ReturnType<
      PublicClient["publicStudyCatalog"]["listRoots"]
    >
    readonly listChildren: (
      input: Parameters<
        PublicClient["publicStudyCatalog"]["listChildren"]
      >[0],
    ) => ReturnType<PublicClient["publicStudyCatalog"]["listChildren"]>
  }
>()("@proxus/frontend-core/study-catalog/client/PublicStudyCatalogClient") {}

export const PublicStudyCatalogClientLive = Layer.effect(
  PublicStudyCatalogClient,
  Effect.gen(function*() {
    const client = yield* PublicApiClient
    return {
      listRoots: client.publicStudyCatalog.listRoots,
      listChildren: client.publicStudyCatalog.listChildren,
    }
  }),
)

/** @deprecated Stable queries consume PublicApiClient directly. */
export const makePublicStudyCatalogClientLayer = () => PublicStudyCatalogClientLive
