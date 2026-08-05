import { AdminApi } from "@proxus/shared/admin-api"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"

type AdminClient = HttpApiClient.ForApi<typeof AdminApi>
class AdminHttpClient extends Context.Service<AdminHttpClient, AdminClient>()(
  "@proxus/admin/modules/study-catalog/api/AdminHttpClient",
) {}

export class AdminStudyCatalogClient extends Context.Service<
  AdminStudyCatalogClient,
  {
    readonly listNodes: (input: Parameters<AdminClient["adminStudyCatalog"]["listNodes"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["listNodes"]>
    readonly getNode: (input: Parameters<AdminClient["adminStudyCatalog"]["getNode"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["getNode"]>
    readonly listOutgoingEdges: (input: Parameters<AdminClient["adminStudyCatalog"]["listOutgoingEdges"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["listOutgoingEdges"]>
    readonly listIncomingEdges: (input: Parameters<AdminClient["adminStudyCatalog"]["listIncomingEdges"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["listIncomingEdges"]>
    readonly listTargets: (input: Parameters<AdminClient["adminStudyCatalog"]["listTargets"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["listTargets"]>
    readonly listSources: (input: Parameters<AdminClient["adminStudyCatalog"]["listSources"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["listSources"]>
    readonly createNode: (input: Parameters<AdminClient["adminStudyCatalog"]["createNode"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["createNode"]>
    readonly renameNode: (input: Parameters<AdminClient["adminStudyCatalog"]["renameNode"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["renameNode"]>
    readonly updateNodeStatus: (input: Parameters<AdminClient["adminStudyCatalog"]["updateNodeStatus"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["updateNodeStatus"]>
    readonly connect: (input: Parameters<AdminClient["adminStudyCatalog"]["connect"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["connect"]>
    readonly updateEdge: (input: Parameters<AdminClient["adminStudyCatalog"]["updateEdge"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["updateEdge"]>
    readonly disconnect: (input: Parameters<AdminClient["adminStudyCatalog"]["disconnect"]>[0]) => ReturnType<AdminClient["adminStudyCatalog"]["disconnect"]>
  }
>()("@proxus/admin/modules/study-catalog/api/AdminStudyCatalogClient") {}

export const makeAdminStudyCatalogClientLayer = (adminBaseUrl: string) => {
  const clientsLayer = Layer.effect(
    AdminHttpClient,
    HttpApiClient.make(AdminApi, { baseUrl: adminBaseUrl }),
  ).pipe(Layer.provide(FetchHttpClient.layer))

  return Layer.effect(
    AdminStudyCatalogClient,
    Effect.gen(function*() {
      const adminClient = yield* AdminHttpClient
      return {
        listNodes: adminClient.adminStudyCatalog.listNodes,
        getNode: adminClient.adminStudyCatalog.getNode,
        listOutgoingEdges: adminClient.adminStudyCatalog.listOutgoingEdges,
        listIncomingEdges: adminClient.adminStudyCatalog.listIncomingEdges,
        listTargets: adminClient.adminStudyCatalog.listTargets,
        listSources: adminClient.adminStudyCatalog.listSources,
        createNode: adminClient.adminStudyCatalog.createNode,
        renameNode: adminClient.adminStudyCatalog.renameNode,
        updateNodeStatus: adminClient.adminStudyCatalog.updateNodeStatus,
        connect: adminClient.adminStudyCatalog.connect,
        updateEdge: adminClient.adminStudyCatalog.updateEdge,
        disconnect: adminClient.adminStudyCatalog.disconnect,
      }
    }),
  ).pipe(Layer.provide(clientsLayer))
}
