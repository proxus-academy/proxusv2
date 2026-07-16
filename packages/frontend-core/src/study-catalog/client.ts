import { PublicApi } from "@proxus/shared/public-api"
import { Context, Effect, Layer } from "effect"
import { HttpApiClient } from "effect/unstable/httpapi"

type PublicClient = HttpApiClient.ForApi<typeof PublicApi>

export class PublicHttpClient extends Context.Service<
  PublicHttpClient,
  PublicClient
>()("@proxus/frontend-core/study-catalog/client/PublicHttpClient") {}

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

export const makePublicStudyCatalogClientLayer = (baseUrl: string) => {
  const httpLayer = Layer.effect(
    PublicHttpClient,
    HttpApiClient.make(PublicApi, { baseUrl }),
  )

  return Layer.effect(
    PublicStudyCatalogClient,
    Effect.gen(function*() {
      const client = yield* PublicHttpClient
      return {
        listRoots: client.publicStudyCatalog.listRoots,
        listChildren: client.publicStudyCatalog.listChildren,
      }
    }),
  ).pipe(Layer.provide(httpLayer))
}
