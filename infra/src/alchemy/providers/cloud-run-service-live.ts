// @effect-diagnostics strictBooleanExpressions:off anyUnknownInErrorContext:off strictEffectProvide:off
import {
  createProjectsLocationsServices, deleteProjectsLocationsServices, getProjectsLocationsOperations,
  getProjectsLocationsServices, listProjectsLocationsServices, patchProjectsLocationsServices,
  type GoogleCloudRunV2Service, type GoogleLongrunningOperation,
} from "@distilled.cloud/gcp/run-v2"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import { Context, Duration, Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import { CloudRunServiceClientError, CloudRunServiceProvider, type CloudRunServiceClient } from "./cloud-run-service.ts"
import { sanitizedCloudError } from "./sanitized-cloud-error.ts"

export interface DistilledCloudRunOperations {
  readonly get: (request: { readonly name: string }) => Effect.Effect<GoogleCloudRunV2Service, unknown>
  readonly list: (request: { readonly parent: string; readonly pageToken?: string }) => Effect.Effect<{ readonly services?: ReadonlyArray<GoogleCloudRunV2Service>; readonly nextPageToken?: string }, unknown>
  readonly create: (request: { readonly parent: string; readonly serviceId: string; readonly body: GoogleCloudRunV2Service }) => Effect.Effect<GoogleLongrunningOperation, unknown>
  readonly patch: (request: { readonly name: string; readonly updateMask: string; readonly body: GoogleCloudRunV2Service }) => Effect.Effect<GoogleLongrunningOperation, unknown>
  readonly delete: (request: { readonly name: string; readonly etag?: string }) => Effect.Effect<GoogleLongrunningOperation, unknown>
  readonly operation: (request: { readonly name: string }) => Effect.Effect<GoogleLongrunningOperation, unknown>
  readonly sleep: Effect.Effect<void>
}
export interface CloudRunLiveOptions {
  readonly project: string
  readonly location: string
  readonly operations?: DistilledCloudRunOperations
  readonly maxOperationPolls?: number
  readonly maxListPages?: number
}
class CloudRunServiceLive extends Context.Service<CloudRunServiceLive, CloudRunServiceClient>()("@proxus/infra/alchemy/providers/cloud-run-service-live/CloudRunServiceLive") {}

const liveLayer = Layer.merge(fromADC(), FetchHttpClient.layer)
const provide = <A, E>(effect: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => effect.pipe(Effect.provide(liveLayer))
const distilledCloudRunOperations: DistilledCloudRunOperations = {
  get: (request) => provide(getProjectsLocationsServices(request)),
  list: (request) => provide(listProjectsLocationsServices(request)),
  create: (request) => provide(createProjectsLocationsServices(request)),
  patch: (request) => provide(patchProjectsLocationsServices(request)),
  delete: (request) => provide(deleteProjectsLocationsServices(request)),
  operation: (request) => provide(getProjectsLocationsOperations(request)),
  sleep: Effect.sleep(Duration.seconds(2)),
}
const codeOf = (cause: unknown): CloudRunServiceClientError["code"] => {
  const details = sanitizedCloudError(cause)
  const tag = details.gcpCode ?? ""
  if (details.status === 404 || tag === "NotFound" || tag === "NOT_FOUND") return "not-found"
  if (details.status === 401 || details.status === 403 || tag === "Forbidden" || tag === "Unauthorized" || tag === "PERMISSION_DENIED") return "forbidden"
  if (details.status === 409 || details.status === 412 || tag === "Conflict" || tag === "ABORTED") return "conflict"
  if (details.status === 400 || details.status === 422 || tag === "BadRequest" || tag === "UnprocessableEntity" || tag === "INVALID_ARGUMENT") return "invalid"
  return "unknown"
}
const normalizedError = (operation: string, code: CloudRunServiceClientError["code"], cause: unknown) =>
  new CloudRunServiceClientError({ operation, code, ...sanitizedCloudError(cause) })
const normalize = (operation: string) => (cause: unknown) => cause instanceof CloudRunServiceClientError ? cause : normalizedError(operation, codeOf(cause), cause)

export const makeLiveCloudRunServiceClient = ({ project, location, operations = distilledCloudRunOperations, maxOperationPolls = 150, maxListPages = 100 }: CloudRunLiveOptions): CloudRunServiceClient => {
  const map = <A>(name: string, effect: Effect.Effect<A, unknown>) => effect.pipe(Effect.mapError(normalize(name)))
  const awaitOperation = (initial: GoogleLongrunningOperation, operationName: string): Effect.Effect<void, CloudRunServiceClientError> => {
    if (!initial.name) return Effect.fail(new CloudRunServiceClientError({ operation: operationName, code: "operation-failed" }))
    const poll = (attempt: number, current: GoogleLongrunningOperation): Effect.Effect<void, CloudRunServiceClientError> => {
      if (current.done === true) return current.error === undefined ? Effect.void : Effect.fail(normalizedError(operationName, "operation-failed", { error: current.error }))
      if (attempt >= maxOperationPolls) return Effect.fail(new CloudRunServiceClientError({ operation: operationName, code: "timeout" }))
      return operations.sleep.pipe(Effect.flatMap(() => map(operationName, operations.operation({ name: initial.name! }))), Effect.flatMap((next) => poll(attempt + 1, next)))
    }
    return poll(0, initial)
  }
  const listPage = (token: string | undefined, page: number): Effect.Effect<ReadonlyArray<GoogleCloudRunV2Service>, CloudRunServiceClientError> => {
    if (page >= maxListPages) return Effect.fail(new CloudRunServiceClientError({ operation: "list", code: "timeout" }))
    return map("list", operations.list({ parent: `projects/${project}/locations/${location}`, ...(token === undefined ? {} : { pageToken: token }) })).pipe(Effect.flatMap((result) => result.nextPageToken === undefined
      ? Effect.succeed(result.services ?? [])
      : listPage(result.nextPageToken, page + 1).pipe(Effect.map((rest) => [...(result.services ?? []), ...rest]))))
  }
  return {
    get: (name) => map("get", operations.get({ name })),
    list: () => listPage(undefined, 0),
    create: (parent, serviceId, body) => map("create", operations.create({ parent, serviceId, body })).pipe(Effect.flatMap((op) => awaitOperation(op, "create")), Effect.flatMap(() => map("get-after-create", operations.get({ name: `${parent}/services/${serviceId}` })))),
    patch: (name, updateMask, body) => map("patch", operations.patch({ name, updateMask, body })).pipe(Effect.flatMap((op) => awaitOperation(op, "patch")), Effect.flatMap(() => map("get-after-patch", operations.get({ name })))),
    delete: (name, etag) => map("delete", operations.delete({ name, ...(etag === undefined ? {} : { etag }) })).pipe(Effect.flatMap((op) => awaitOperation(op, "delete"))),
  }
}
export const cloudRunServiceLiveLayer = (options: CloudRunLiveOptions) => CloudRunServiceProvider(makeLiveCloudRunServiceClient(options))
