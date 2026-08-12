import { AdminApi } from "@proxus/shared/admin-api"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
type Client = HttpApiClient.ForApi<typeof AdminApi>["adminAgentRuns"]
export class AdminAgentRunsClient extends Context.Service<AdminAgentRunsClient, Client>()("@proxus/admin/agent-runs/AdminAgentRunsClient") {}
export const AdminAgentRunsClientLive = Layer.effect(AdminAgentRunsClient, Effect.gen(function*() {
  const client = yield* HttpApiClient.make(AdminApi, { baseUrl: "/admin-api" })
  return client.adminAgentRuns
})).pipe(Layer.provide(FetchHttpClient.layer))
