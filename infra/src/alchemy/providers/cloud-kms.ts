// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off globalDate:off
import { Resource } from "alchemy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

export class CloudKmsClientError extends Data.TaggedError("CloudKmsClientError")<{
  readonly operation: string
  readonly resource?: string
  readonly status?: number
  readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "unknown"
  readonly gcpCode?: string
  readonly message?: string
}> {}
export class CryptoKeyDeletionProtectedError extends Data.TaggedError("CryptoKeyDeletionProtectedError")<{ readonly name: string }> {}

export interface KeyRingMetadata { readonly name: string; readonly project: string; readonly location: string; readonly keyRingId: string; readonly createTime?: string }
export interface CryptoKeyMetadata {
  readonly name: string; readonly keyRing: string; readonly cryptoKeyId: string; readonly purpose: string
  readonly rotationPeriod?: string; readonly nextRotationTime?: string; readonly labels: Readonly<Record<string, string>>; readonly createTime?: string
}
export interface KmsIamPolicy { readonly etag?: string; readonly version?: number; readonly bindings: ReadonlyArray<{ readonly role: string; readonly members: ReadonlyArray<string>; readonly condition?: unknown }> }
export interface CloudKmsClient {
  getKeyRing(name: string): Effect.Effect<KeyRingMetadata, CloudKmsClientError>
  listKeyRings(parent: string): Effect.Effect<ReadonlyArray<KeyRingMetadata>, CloudKmsClientError>
  createKeyRing(parent: string, keyRingId: string): Effect.Effect<KeyRingMetadata, CloudKmsClientError>
  getCryptoKey(name: string): Effect.Effect<CryptoKeyMetadata, CloudKmsClientError>
  listCryptoKeys(parent: string): Effect.Effect<ReadonlyArray<CryptoKeyMetadata>, CloudKmsClientError>
  createCryptoKey(input: { readonly parent: string; readonly cryptoKeyId: string; readonly purpose: string; readonly rotationPeriod?: string; readonly nextRotationTime?: string; readonly labels: Readonly<Record<string, string>> }): Effect.Effect<CryptoKeyMetadata, CloudKmsClientError>
  updateCryptoKey(input: { readonly name: string; readonly rotationPeriod?: string; readonly nextRotationTime?: string; readonly labels: Readonly<Record<string, string>>; readonly updateMask: ReadonlyArray<"labels" | "rotation_period" | "next_rotation_time"> }): Effect.Effect<CryptoKeyMetadata, CloudKmsClientError>
  getIamPolicy(name: string): Effect.Effect<KmsIamPolicy, CloudKmsClientError>
  setIamPolicy(name: string, policy: KmsIamPolicy): Effect.Effect<void, CloudKmsClientError>
}

export interface KeyRingProps { readonly project: string; readonly location: string; readonly keyRingId: string }
export type KeyRing = Resource<"Proxus.GCP.KMS.KeyRing", KeyRingProps, KeyRingMetadata>
export const KeyRing = Resource<KeyRing>("Proxus.GCP.KMS.KeyRing")
interface CryptoKeyProps { readonly keyRing: string; readonly cryptoKeyId: string; readonly purpose?: string; readonly rotationPeriod?: string; readonly nextRotationTime?: string; readonly labels?: Readonly<Record<string, string>>; readonly deletionProtection?: boolean }
type CryptoKeyAttributes = CryptoKeyMetadata & { readonly deletionProtection: boolean }
export type CryptoKey = Resource<"Proxus.GCP.KMS.CryptoKey", CryptoKeyProps, CryptoKeyAttributes>
export const CryptoKey = Resource<CryptoKey>("Proxus.GCP.KMS.CryptoKey")
interface CryptoKeyIamMemberProps { readonly cryptoKey: string; readonly role: string; readonly member: string }
export type CryptoKeyIamMember = Resource<"Proxus.GCP.KMS.CryptoKeyIamMember", CryptoKeyIamMemberProps, CryptoKeyIamMemberProps>
export const CryptoKeyIamMember = Resource<CryptoKeyIamMember>("Proxus.GCP.KMS.CryptoKeyIamMember")

const missing = (e: CloudKmsClientError) => e.code === "not-found"
const observe = <A>(effect: Effect.Effect<A, CloudKmsClientError>) => effect.pipe(Effect.catchIf(missing, () => Effect.succeed(undefined)))
const ringName = (p: KeyRingProps) => `projects/${p.project}/locations/${p.location}/keyRings/${p.keyRingId}`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const durationSeconds = (value: string | undefined): number | undefined => {
  const match = /^(\d+)(?:\.(\d{1,9}))?s$/.exec(value ?? "")
  if (!match?.[1]) return undefined
  const seconds = Number(match[1]) + Number(`0.${match[2] ?? "0"}`)
  return Number.isSafeInteger(Number(match[1])) && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}
const sameDuration = (a: string | undefined, b: string | undefined) => {
  const left = durationSeconds(a); const right = durationSeconds(b)
  return left !== undefined && right !== undefined ? left === right : a === b
}
const validFutureTime = (value: string | undefined, now: number) => {
  const time = value === undefined ? Number.NaN : Date.parse(value)
  return Number.isFinite(time) && time > now ? value : undefined
}
const nextRotation = (current: CryptoKeyMetadata, requested: string | undefined, period: string, now: number) => {
  const live = validFutureTime(current.nextRotationTime, now)
  if (live !== undefined) return live
  const explicit = validFutureTime(requested, now)
  if (explicit !== undefined) return explicit
  const seconds = durationSeconds(period)
  if (seconds === undefined) return undefined
  const candidate = now + Math.ceil(seconds * 1_000)
  return Number.isFinite(candidate) && candidate > now && candidate <= 8_640_000_000_000_000 ? new Date(candidate).toISOString() : undefined
}

export const makeKeyRingProviderService = (client: CloudKmsClient) => KeyRing.Provider.of({
  stables: ["name", "project", "location", "keyRingId"],
  list: () => Effect.succeed([]),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed((["project", "location", "keyRingId"] as const).some((k) => (output?.[k] ?? olds[k]) !== news[k]) ? { action: "replace" } as const : undefined),
  read: ({ output, olds }) => { const p = output ?? olds; return p.project && p.location && p.keyRingId ? observe(client.getKeyRing(ringName(p))) : Effect.succeed(undefined) },
  reconcile: ({ news }) => Effect.gen(function* () { const name = ringName(news); const found = yield* observe(client.getKeyRing(name)); return found ?? (yield* client.createKeyRing(`projects/${news.project}/locations/${news.location}`, news.keyRingId).pipe(Effect.catchIf((e) => e.code === "conflict", () => client.getKeyRing(name)))) }),
  // Cloud KMS key rings cannot be deleted. Destroy only releases them from state.
  delete: () => Effect.void,
})

export const makeCryptoKeyProviderService = (client: CloudKmsClient, now: () => number = Date.now) => CryptoKey.Provider.of({
  stables: ["name", "keyRing", "cryptoKeyId", "purpose"],
  list: () => Effect.succeed([]),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed((output?.keyRing ?? olds.keyRing) !== news.keyRing || (output?.cryptoKeyId ?? olds.cryptoKeyId) !== news.cryptoKeyId || (output?.purpose ?? olds.purpose ?? "ENCRYPT_DECRYPT") !== (news.purpose ?? "ENCRYPT_DECRYPT") ? { action: "replace" } as const : undefined),
  read: ({ output, olds }) => { const keyRing = output?.keyRing ?? olds.keyRing; const id = output?.cryptoKeyId ?? olds.cryptoKeyId; return keyRing && id ? observe(client.getCryptoKey(`${keyRing}/cryptoKeys/${id}`)).pipe(Effect.map((x) => x && ({ ...x, deletionProtection: output?.deletionProtection ?? olds.deletionProtection ?? true }))) : Effect.succeed(undefined) },
  reconcile: ({ news }) => Effect.gen(function* () {
    const name = `${news.keyRing}/cryptoKeys/${news.cryptoKeyId}`; const purpose = news.purpose ?? "ENCRYPT_DECRYPT"; const labels = { ...(news.labels ?? {}) }
    let current = yield* observe(client.getCryptoKey(name))
    if (!current) current = yield* client.createCryptoKey({ parent: news.keyRing, cryptoKeyId: news.cryptoKeyId, purpose, ...(news.rotationPeriod === undefined ? {} : { rotationPeriod: news.rotationPeriod }), ...(news.nextRotationTime === undefined ? {} : { nextRotationTime: news.nextRotationTime }), labels }).pipe(Effect.catchIf((e) => e.code === "conflict", () => client.getCryptoKey(name)))
    if (current.purpose !== purpose) return yield* new CloudKmsClientError({ operation: "adopt-crypto-key", code: "conflict" })
    const updateMask: Array<"labels" | "rotation_period" | "next_rotation_time"> = []
    if (!same(current.labels, labels)) updateMask.push("labels")
    const changesSchedule = news.rotationPeriod !== undefined && !sameDuration(current.rotationPeriod, news.rotationPeriod)
    const scheduleTime = changesSchedule ? nextRotation(current, news.nextRotationTime, news.rotationPeriod!, now()) : undefined
    if (changesSchedule) {
      if (scheduleTime === undefined) return yield* new CloudKmsClientError({ operation: "update-crypto-key", resource: name, code: "invalid", message: "rotationPeriod must be a positive protobuf duration" })
      updateMask.push("rotation_period", "next_rotation_time")
    }
    if (updateMask.length > 0) current = yield* client.updateCryptoKey({ name, labels, updateMask, ...(changesSchedule ? { rotationPeriod: news.rotationPeriod!, nextRotationTime: scheduleTime! } : {}) })
    return { ...current, deletionProtection: news.deletionProtection ?? true }
  }),
  // GCP has no CryptoKey delete API: protection blocks state removal; opting out forgets the key, never destroys material.
  delete: ({ output }) => output.deletionProtection ? Effect.fail(new CryptoKeyDeletionProtectedError({ name: output.name })) : Effect.void,
})

const has = (p: KmsIamPolicy, role: string, member: string) => p.bindings.some((b) => b.role === role && b.condition === undefined && b.members.includes(member))
export const makeCryptoKeyIamMemberProviderService = (client: CloudKmsClient) => CryptoKeyIamMember.Provider.of({
  nuke: { skip: true }, stables: ["cryptoKey", "role", "member"], list: () => Effect.succeed([]),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed((["cryptoKey", "role", "member"] as const).some((k) => (output?.[k] ?? olds[k]) !== news[k]) ? { action: "replace" } as const : undefined),
  read: ({ output, olds }) => { const v = { cryptoKey: output?.cryptoKey ?? olds.cryptoKey, role: output?.role ?? olds.role, member: output?.member ?? olds.member }; return !v.cryptoKey || !v.role || !v.member ? Effect.succeed(undefined) : client.getIamPolicy(v.cryptoKey).pipe(Effect.map((p) => has(p, v.role, v.member) ? v as CryptoKeyIamMemberProps : undefined), Effect.catchIf(missing, () => Effect.succeed(undefined))) },
  reconcile: ({ news }) => Effect.gen(function* () { const p = yield* client.getIamPolicy(news.cryptoKey); if (!has(p, news.role, news.member)) { const bindings = p.bindings.map((b) => ({ ...b, members: [...b.members] })); const b = bindings.find((x) => x.role === news.role && x.condition === undefined); if (b) b.members = [...b.members, news.member]; else bindings.push({ role: news.role, members: [news.member] }); yield* client.setIamPolicy(news.cryptoKey, { ...p, version: 3, bindings }) }; return { ...news } }),
  delete: ({ output }) => client.getIamPolicy(output.cryptoKey).pipe(Effect.flatMap((p) => !has(p, output.role, output.member) ? Effect.void : client.setIamPolicy(output.cryptoKey, { ...p, version: 3, bindings: p.bindings.map((b) => b.role === output.role && b.condition === undefined ? { ...b, members: b.members.filter((m) => m !== output.member) } : { ...b, members: [...b.members] }).filter((b) => b.members.length > 0) })), Effect.catchIf(missing, () => Effect.void)),
})
export const KeyRingProvider = (c: CloudKmsClient) => Provider.succeed(KeyRing, makeKeyRingProviderService(c))
export const CryptoKeyProvider = (c: CloudKmsClient) => Provider.succeed(CryptoKey, makeCryptoKeyProviderService(c))
export const CryptoKeyIamMemberProvider = (c: CloudKmsClient) => Provider.succeed(CryptoKeyIamMember, makeCryptoKeyIamMemberProviderService(c))
