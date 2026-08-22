import { AdminApi } from "@proxus/shared/admin-api"
import type { UgcCommand } from "@proxus/shared/ugc-management"
import { Context, Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"

type Client = HttpApiClient.ForApi<typeof AdminApi>["adminUgc"]
class AdminUgcClient extends Context.Service<AdminUgcClient, Client>()("@proxus/admin/modules/ugc-management/state/AdminUgcClient") {}

const clientLayer = Layer.effect(AdminUgcClient, Effect.gen(function*() {
  const client = yield* HttpApiClient.make(AdminApi, { baseUrl: "/admin-api" })
  return client.adminUgc
})).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" })),
)

const runtime = Atom.runtime(clientLayer)
export const adminUgcWorkspaceQuery = runtime.atom(Effect.flatMap(AdminUgcClient, (client) => client.workspace()))
export const adminUgcCommandAction = runtime.fn((command: UgcCommand, get) => Effect.flatMap(AdminUgcClient, (client) => client.command({ payload: { command } })).pipe(
  Effect.tap(() => Effect.sync(() => get.refresh(adminUgcWorkspaceQuery))),
))
