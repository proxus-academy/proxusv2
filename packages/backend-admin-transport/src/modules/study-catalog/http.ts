import { Access, Forbidden, RoleStoreError } from "@proxus/backend-domain/access-control"
import { StudyCatalog, StudyCatalogRepositoryError } from "@proxus/backend-domain/study-catalog"
import { Forbidden as HttpForbidden } from "@proxus/shared/access-control"
import { AdminApi } from "@proxus/shared/admin-api"
import { CurrentUser } from "@proxus/shared/auth"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const mapRepositoryError = <A, E, R>(effect: Effect.Effect<A, E | StudyCatalogRepositoryError, R>) =>
  effect.pipe(Effect.catchTag("StudyCatalogRepositoryError", () => Effect.fail(new HttpApiError.InternalServerError({}))))
const mapMutationError = <A, E, R>(effect: Effect.Effect<A, E | StudyCatalogRepositoryError | Forbidden | RoleStoreError, R | typeof Access.CurrentSubject.Identifier>) =>
  Effect.flatMap(CurrentUser, (current) => effect.pipe(
    Effect.provideService(Access.CurrentSubject, { type: "user", id: current.account.id }),
    Effect.catchTag("Forbidden", () => Effect.fail(new HttpForbidden({ message: "Forbidden" }))),
    Effect.catchTag("RoleStoreError", () => Effect.fail(new HttpApiError.InternalServerError({}))),
    Effect.catchTag("StudyCatalogRepositoryError", () => Effect.fail(new HttpApiError.InternalServerError({}))),
  ))

export const AdminStudyCatalogHandlers = HttpApiBuilder.group(
  AdminApi,
  "adminStudyCatalog",
  Effect.fn(function* (handlers) {
    const catalog = yield* StudyCatalog

    return handlers
      .handle("listNodes", ({ query }) => mapRepositoryError(catalog.listNodes(query)))
      .handle("getNode", ({ params }) => mapRepositoryError(catalog.getNode(params.nodeId)))
      .handle("listOutgoingEdges", ({ params }) => mapRepositoryError(catalog.listOutgoingEdges(params.nodeId)))
      .handle("listIncomingEdges", ({ params }) => mapRepositoryError(catalog.listIncomingEdges(params.nodeId)))
      .handle("listTargets", ({ params }) => mapRepositoryError(catalog.listTargets(params.nodeId)))
      .handle("listSources", ({ params }) => mapRepositoryError(catalog.listSources(params.nodeId)))
      .handle("createNode", ({ payload }) => mapMutationError(catalog.createNode(payload)))
      .handle("renameNode", ({ params, payload }) => mapMutationError(catalog.renameNode(params.nodeId, payload.name)))
      .handle("updateNodeStatus", ({ params, payload }) => mapMutationError(catalog.updateNodeStatus(params.nodeId, payload)))
      .handle("connect", ({ payload }) => mapMutationError(catalog.connect(payload)))
      .handle("updateEdge", ({ params, payload }) => mapMutationError(catalog.updateEdge(params.edgeId, payload)))
      .handle("disconnect", ({ params }) => mapMutationError(catalog.disconnect(params.edgeId)))
  }),
)
