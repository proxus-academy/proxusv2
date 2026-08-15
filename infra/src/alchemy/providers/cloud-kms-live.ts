// @effect-diagnostics strictBooleanExpressions:off anyUnknownInErrorContext:off strictEffectProvide:off
import { createProjectsLocationsKeyRings, createProjectsLocationsKeyRingsCryptoKeys, getIamPolicyProjectsLocationsKeyRingsCryptoKeys, getProjectsLocationsKeyRings, getProjectsLocationsKeyRingsCryptoKeys, listProjectsLocationsKeyRings, listProjectsLocationsKeyRingsCryptoKeys, patchProjectsLocationsKeyRingsCryptoKeys, setIamPolicyProjectsLocationsKeyRingsCryptoKeys, type CryptoKey, type KeyRing, type Policy } from "@distilled.cloud/gcp/cloudkms-v1"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import { Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import { CloudKmsClientError, CryptoKeyIamMemberProvider, CryptoKeyProvider, KeyRingProvider, type CloudKmsClient, type CryptoKeyMetadata, type KeyRingMetadata, type KmsIamPolicy } from "./cloud-kms.ts"

export interface DistilledCloudKmsOperations {
  getRing(r: { name: string }): Effect.Effect<KeyRing, unknown>; listRings(r: { parent: string; pageToken?: string }): Effect.Effect<{ keyRings?: ReadonlyArray<KeyRing>; nextPageToken?: string }, unknown>; createRing(r: { parent: string; keyRingId: string; body: KeyRing }): Effect.Effect<KeyRing, unknown>
  getKey(r: { name: string }): Effect.Effect<CryptoKey, unknown>; listKeys(r: { parent: string; pageToken?: string }): Effect.Effect<{ cryptoKeys?: ReadonlyArray<CryptoKey>; nextPageToken?: string }, unknown>; createKey(r: { parent: string; cryptoKeyId: string; body: CryptoKey }): Effect.Effect<CryptoKey, unknown>; patchKey(r: { name: string; updateMask: string; body: CryptoKey }): Effect.Effect<CryptoKey, unknown>
  getPolicy(r: { resource: string; "options.requestedPolicyVersion": number }): Effect.Effect<Policy, unknown>; setPolicy(r: { resource: string; body: { policy: Policy; updateMask: string } }): Effect.Effect<Policy, unknown>
}
export interface CloudKmsLiveOptions { readonly project: string; readonly operations?: DistilledCloudKmsOperations }
const live = Layer.merge(fromADC(), FetchHttpClient.layer)
const provide = <A, E>(e: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => e.pipe(Effect.provide(live))
const distilledCloudKmsOperations: DistilledCloudKmsOperations = {
  getRing: (r) => provide(getProjectsLocationsKeyRings(r)), listRings: (r) => provide(listProjectsLocationsKeyRings(r)), createRing: (r) => provide(createProjectsLocationsKeyRings(r)),
  getKey: (r) => provide(getProjectsLocationsKeyRingsCryptoKeys(r)), listKeys: (r) => provide(listProjectsLocationsKeyRingsCryptoKeys(r)), createKey: (r) => provide(createProjectsLocationsKeyRingsCryptoKeys(r)), patchKey: (r) => provide(patchProjectsLocationsKeyRingsCryptoKeys(r)),
  getPolicy: (r) => provide(getIamPolicyProjectsLocationsKeyRingsCryptoKeys(r)), setPolicy: (r) => provide(setIamPolicyProjectsLocationsKeyRingsCryptoKeys(r)),
}
const record = (x: unknown): Record<string, unknown> | undefined => typeof x === "object" && x !== null ? x as Record<string, unknown> : undefined
const text = (x: unknown): string | undefined => typeof x === "string" && x.length > 0 ? x : undefined
const safeMessage = (value: unknown): string | undefined => {
  const message = text(value)
  if (!message) return undefined
  return message.slice(0, 500)
    .replace(/([?&](?:key|token|signature|credential|password|secret|access_token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [REDACTED]")
    .replace(/\b(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
}
const details = (cause: unknown) => {
  const outer = record(cause); const nested = record(outer?.error); const response = record(outer?.response)
  const statusValue = outer?.status ?? outer?.statusCode ?? response?.status
  const status = typeof statusValue === "number" && Number.isInteger(statusValue) && statusValue >= 100 && statusValue <= 599 ? statusValue : undefined
  const gcpCode = text(nested?.code) ?? text(outer?.code) ?? text(outer?._tag)
  const message = safeMessage(nested?.message ?? outer?.message)
  return { status, gcpCode, message }
}
const code = (x: unknown): CloudKmsClientError["code"] => { const d = details(x); const t = d.gcpCode ?? ""; return d.status === 404 || t === "NotFound" ? "not-found" : d.status === 401 || d.status === 403 || t === "Forbidden" || t === "Unauthorized" ? "forbidden" : d.status === 409 || t === "Conflict" ? "conflict" : d.status === 400 || d.status === 422 || t === "BadRequest" || t === "UnprocessableEntity" ? "invalid" : "unknown" }
const normalize = (operation: string, resource: string) => (cause: unknown) => { const d = details(cause); return new CloudKmsClientError({ operation, resource, code: code(cause), ...(d.status === undefined ? {} : { status: d.status }), ...(d.gcpCode === undefined ? {} : { gcpCode: d.gcpCode }), ...(d.message === undefined ? {} : { message: d.message }) }) }
const schema = (operation: string, resource: string) => new CloudKmsClientError({ operation, resource, code: "unknown", gcpCode: "InvalidResponseSchema", message: "Cloud KMS returned an invalid response schema" })
const ring = (v: KeyRing, operation: string, resource: string): Effect.Effect<KeyRingMetadata, CloudKmsClientError> => Effect.try({ try: () => { const m = /^projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)$/.exec(v.name ?? ""); if (!m?.[1] || !m[2] || !m[3]) throw 0; return { name: v.name!, project: m[1], location: m[2], keyRingId: m[3], ...(v.createTime ? { createTime: v.createTime } : {}) } }, catch: () => schema(operation, resource) })
const key = (v: CryptoKey, operation: string, resource: string): Effect.Effect<CryptoKeyMetadata, CloudKmsClientError> => Effect.try({ try: () => { const m = /^(projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+)\/cryptoKeys\/([^/]+)$/.exec(v.name ?? ""); if (!m?.[1] || !m[2] || !v.purpose) throw 0; return { name: v.name!, keyRing: m[1], cryptoKeyId: m[2], purpose: v.purpose, labels: { ...(v.labels ?? {}) }, ...(v.rotationPeriod ? { rotationPeriod: v.rotationPeriod } : {}), ...(v.nextRotationTime ? { nextRotationTime: v.nextRotationTime } : {}), ...(v.createTime ? { createTime: v.createTime } : {}) } }, catch: () => schema(operation, resource) })
const policy = (p: Policy): KmsIamPolicy => ({ ...(p.etag ? { etag: p.etag } : {}), ...(p.version === undefined ? {} : { version: p.version }), bindings: (p.bindings ?? []).map((b) => ({ role: b.role ?? "", members: [...(b.members ?? [])], ...(b.condition ? { condition: b.condition } : {}) })) })
export const makeLiveCloudKmsClient = ({ operations: o = distilledCloudKmsOperations }: CloudKmsLiveOptions): CloudKmsClient => {
  const map = <A>(op: string, resource: string, e: Effect.Effect<A, unknown>) => e.pipe(Effect.mapError(normalize(op, resource)))
  const rings = (parent: string, token?: string): Effect.Effect<ReadonlyArray<KeyRingMetadata>, CloudKmsClientError> => map("list-key-rings", parent, o.listRings({ parent, ...(token ? { pageToken: token } : {}) })).pipe(Effect.flatMap((p) => Effect.all((p.keyRings ?? []).map((x) => ring(x, "list-key-rings", parent))).pipe(Effect.flatMap((xs) => p.nextPageToken ? rings(parent, p.nextPageToken).pipe(Effect.map((ys) => [...xs, ...ys])) : Effect.succeed(xs)))))
  const keys = (parent: string, token?: string): Effect.Effect<ReadonlyArray<CryptoKeyMetadata>, CloudKmsClientError> => map("list-crypto-keys", parent, o.listKeys({ parent, ...(token ? { pageToken: token } : {}) })).pipe(Effect.flatMap((p) => Effect.all((p.cryptoKeys ?? []).map((x) => key(x, "list-crypto-keys", parent))).pipe(Effect.flatMap((xs) => p.nextPageToken ? keys(parent, p.nextPageToken).pipe(Effect.map((ys) => [...xs, ...ys])) : Effect.succeed(xs)))))
  return { getKeyRing: (n) => map("get-key-ring", n, o.getRing({ name: n })).pipe(Effect.flatMap((x) => ring(x, "get-key-ring", n))), listKeyRings: rings, createKeyRing: (parent, id) => map("create-key-ring", `${parent}/keyRings/${id}`, o.createRing({ parent, keyRingId: id, body: {} })).pipe(Effect.flatMap((x) => ring(x, "create-key-ring", `${parent}/keyRings/${id}`))), getCryptoKey: (n) => map("get-crypto-key", n, o.getKey({ name: n })).pipe(Effect.flatMap((x) => key(x, "get-crypto-key", n))), listCryptoKeys: keys, createCryptoKey: (i) => map("create-crypto-key", `${i.parent}/cryptoKeys/${i.cryptoKeyId}`, o.createKey({ parent: i.parent, cryptoKeyId: i.cryptoKeyId, body: { purpose: i.purpose, labels: { ...i.labels }, versionTemplate: { algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION" }, ...(i.rotationPeriod ? { rotationPeriod: i.rotationPeriod } : {}), ...(i.nextRotationTime ? { nextRotationTime: i.nextRotationTime } : {}) } })).pipe(Effect.flatMap((x) => key(x, "create-crypto-key", `${i.parent}/cryptoKeys/${i.cryptoKeyId}`))), updateCryptoKey: (i) => map("update-crypto-key", i.name, o.patchKey({ name: i.name, updateMask: i.updateMask.join(","), body: { name: i.name, ...(i.updateMask.includes("labels") ? { labels: { ...i.labels } } : {}), ...(i.rotationPeriod ? { rotationPeriod: i.rotationPeriod } : {}), ...(i.nextRotationTime ? { nextRotationTime: i.nextRotationTime } : {}) } })).pipe(Effect.flatMap((x) => key(x, "update-crypto-key", i.name))), getIamPolicy: (n) => map("get-iam-policy", n, o.getPolicy({ resource: n, "options.requestedPolicyVersion": 3 })).pipe(Effect.map(policy)), setIamPolicy: (n, p) => map("set-iam-policy", n, o.setPolicy({ resource: n, body: { policy: p as Policy, updateMask: "bindings,etag,version" } })).pipe(Effect.asVoid) }
}
export const cloudKmsProviderLayers = (options: CloudKmsLiveOptions) => { const c = makeLiveCloudKmsClient(options); return Layer.mergeAll(KeyRingProvider(c), CryptoKeyProvider(c), CryptoKeyIamMemberProvider(c)) }
