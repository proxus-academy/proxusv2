import { makeAuthAtoms } from "@proxus/frontend-core/auth"
import { makePublicApiClientLayer, PublicApiClient } from "@proxus/frontend-core/public-api"
import { AdminApi } from "@proxus/shared/admin-api"
import type { Capabilities } from "@proxus/shared/access-control"
import { Context, Data, Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"

export class AdminUnauthorized extends Data.TaggedError("AdminUnauthorized")<{}> {}
export class AdminForbidden extends Data.TaggedError("AdminForbidden")<{}> {}
export class AdminCapabilitiesError extends Data.TaggedError("AdminCapabilitiesError")<{}> {}
export type AdminAccessError = AdminUnauthorized | AdminForbidden | AdminCapabilitiesError

export class AdminAccessClient extends Context.Service<AdminAccessClient, {
  readonly capabilities: () => Effect.Effect<Capabilities, AdminAccessError>
}>()("@proxus/admin/modules/auth/admin-auth/AdminAccessClient") {}

const statusOf = (cause: unknown): number | undefined => {
  if (typeof cause !== "object" || cause === null) return undefined
  if ("status" in cause && typeof cause.status === "number") return cause.status
  if ("response" in cause) return statusOf(cause.response)
  if ("cause" in cause) return statusOf(cause.cause)
  return undefined
}

// HTTP clients expose vendor-specific failures at this adapter boundary; they are immediately normalized.
// @effect-diagnostics anyUnknownInErrorContext:off
export const adminAccessLayer = (load: () => Effect.Effect<Capabilities, unknown>) => Layer.succeed(
  AdminAccessClient,
  AdminAccessClient.of({
    capabilities: () => load().pipe(Effect.mapError((cause) => {
      const status = statusOf(cause)
      return status === 401 ? new AdminUnauthorized() : status === 403 ? new AdminForbidden() : new AdminCapabilitiesError()
    })),
  }),
)

const liveAccessLayer = Layer.unwrap(HttpApiClient.make(AdminApi, { baseUrl: "/admin-api" }).pipe(
  Effect.map((client) => adminAccessLayer(() => client.adminAccessControl.capabilities({}))),
)).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" })),
)

const publicHttpTransport = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" })),
)
const publicApiLayer = makePublicApiClientLayer("/api").pipe(
  Layer.provide(publicHttpTransport),
)

const makeAdminAuthComposition = (layer: Layer.Layer<PublicApiClient | AdminAccessClient>) => {
  const runtime = Atom.runtime(layer)
  const auth = makeAuthAtoms(runtime)
  const capabilitiesAtom = runtime.atom(AdminAccessClient.use((client) => client.capabilities()))
  const accessAtom = Atom.make((get): AsyncResult.AsyncResult<Capabilities, AdminAccessError> => get(capabilitiesAtom))
  return { runtime, auth, capabilitiesAtom: accessAtom }
}

export const adminAuthComposition = makeAdminAuthComposition(
  Layer.merge(publicApiLayer, liveAccessLayer),
)

export const hasPermission = (capabilities: Capabilities, permission: Capabilities["permissions"][number]) =>
  capabilities.permissions.includes(permission)
