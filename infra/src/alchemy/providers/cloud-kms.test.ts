// @effect-diagnostics asyncFunction:off strictBooleanExpressions:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { ScopedPlanStatusSession } from "alchemy/Cli/Cli"
import { CloudKmsClientError, CryptoKeyDeletionProtectedError, makeCryptoKeyIamMemberProviderService, makeCryptoKeyProviderService, makeKeyRingProviderService, type CloudKmsClient, type CryptoKeyMetadata, type KeyRingMetadata, type KmsIamPolicy } from "./cloud-kms.ts"
const run = Effect.runPromise
const base = { id: "K", fqn: "foundation/K", instanceId: "i", session: { note: () => Effect.void } as unknown as ScopedPlanStatusSession, bindings: [] }
const fake = () => { const rings = new Map<string, KeyRingMetadata>(); const keys = new Map<string, CryptoKeyMetadata>(); const policies = new Map<string, KmsIamPolicy>(); const calls: string[] = []; const nf = (op: string) => Effect.fail(new CloudKmsClientError({ operation: op, code: "not-found" })); const client: CloudKmsClient = {
  getKeyRing: (n) => rings.has(n) ? Effect.succeed(rings.get(n)!) : nf("get-ring"), listKeyRings: () => Effect.succeed([...rings.values()]), createKeyRing: (p, id) => { calls.push("create-ring"); const m = /^projects\/([^/]+)\/locations\/([^/]+)$/.exec(p)!; const x = { name: `${p}/keyRings/${id}`, project: m[1]!, location: m[2]!, keyRingId: id }; rings.set(x.name, x); return Effect.succeed(x) },
  getCryptoKey: (n) => keys.has(n) ? Effect.succeed(keys.get(n)!) : nf("get-key"), listCryptoKeys: () => Effect.succeed([...keys.values()]), createCryptoKey: (i) => { calls.push("create-key"); const x = { name: `${i.parent}/cryptoKeys/${i.cryptoKeyId}`, keyRing: i.parent, cryptoKeyId: i.cryptoKeyId, purpose: i.purpose, labels: i.labels, ...(i.rotationPeriod ? { rotationPeriod: i.rotationPeriod } : {}), ...(i.nextRotationTime ? { nextRotationTime: i.nextRotationTime } : {}) }; keys.set(x.name, x); return Effect.succeed(x) }, updateCryptoKey: (i) => { calls.push("update-key"); const old = keys.get(i.name)!; const x = { ...old, labels: i.labels, ...(i.rotationPeriod ? { rotationPeriod: i.rotationPeriod } : {}), ...(i.nextRotationTime ? { nextRotationTime: i.nextRotationTime } : {}) }; keys.set(i.name, x); return Effect.succeed(x) },
  getIamPolicy: (n) => { calls.push("get-policy"); return Effect.succeed(policies.get(n) ?? { bindings: [] }) }, setIamPolicy: (n, p) => { calls.push("set-policy"); policies.set(n, p); return Effect.void },
}; return { client, rings, keys, policies, calls } }
describe("internal Cloud KMS providers", () => {
  it("creates and adopts an immutable KeyRing idempotently without attempting deletion", async () => { const f = fake(); const p = makeKeyRingProviderService(f.client); const news = { project: "p", location: "europe", keyRingId: "state" }; const out = await run(p.reconcile({ ...base, news, olds: undefined, output: undefined })); await run(p.reconcile({ ...base, news, olds: news, output: out })); expect(f.calls).toEqual(["create-ring"]); await run(p.delete({ ...base, olds: news, output: out })); expect(f.rings.size).toBe(1) })
  it("adopts the real live CryptoKey shape without creating or changing an already matching key", async () => {
    const f = fake(); const keyRing = "projects/proxus-v2/locations/europe-southwest1/keyRings/pulumi-state"; const name = `${keyRing}/cryptoKeys/pulumi-secrets`
    f.keys.set(name, { name, keyRing, cryptoKeyId: "pulumi-secrets", purpose: "ENCRYPT_DECRYPT", rotationPeriod: "7776000s", nextRotationTime: "2026-11-11T17:57:42Z", labels: {}, createTime: "2026-08-13T17:57:42.553622123Z" })
    const news = { keyRing, cryptoKeyId: "pulumi-secrets", purpose: "ENCRYPT_DECRYPT", rotationPeriod: "7776000s", nextRotationTime: "2026-11-11T17:57:42Z", labels: {} }
    const out = await run(makeCryptoKeyProviderService(f.client).reconcile({ ...base, news, olds: undefined, output: undefined }))
    expect(out).toMatchObject({ name, deletionProtection: true }); expect(f.calls).toEqual([])
  })
  it("treats normalized rotation periods as idempotent and preserves the live schedule", async () => {
    const f = fake(); const keyRing = "projects/p/locations/europe/keyRings/r"; const name = `${keyRing}/cryptoKeys/state`
    f.keys.set(name, { name, keyRing, cryptoKeyId: "state", purpose: "ENCRYPT_DECRYPT", rotationPeriod: "7776000.000000000s", nextRotationTime: "2030-01-01T00:00:00Z", labels: {} })
    const out = await run(makeCryptoKeyProviderService(f.client, () => Date.parse("2029-01-01T00:00:00Z")).reconcile({ ...base, news: { keyRing, cryptoKeyId: "state", rotationPeriod: "7776000s" }, olds: undefined, output: undefined }))
    expect(out.nextRotationTime).toBe("2030-01-01T00:00:00Z"); expect(f.calls).toEqual([])
  })
  it("updates a rotation period with both schedule fields and preserves a valid live next rotation", async () => {
    const f = fake(); const keyRing = "projects/p/locations/europe/keyRings/r"; const name = `${keyRing}/cryptoKeys/state`; const liveNext = "2030-02-01T00:00:00Z"
    f.keys.set(name, { name, keyRing, cryptoKeyId: "state", purpose: "ENCRYPT_DECRYPT", rotationPeriod: "86400s", nextRotationTime: liveNext, labels: {} })
    await run(makeCryptoKeyProviderService(f.client, () => Date.parse("2030-01-01T00:00:00Z")).reconcile({ ...base, news: { keyRing, cryptoKeyId: "state", rotationPeriod: "7776000s" }, olds: undefined, output: undefined }))
    expect(f.keys.get(name)).toMatchObject({ rotationPeriod: "7776000s", nextRotationTime: liveNext }); expect(f.calls).toEqual(["update-key"])
  })
  it("calculates a deterministic future next rotation when establishing a schedule", async () => {
    const f = fake(); const keyRing = "projects/p/locations/europe/keyRings/r"; const name = `${keyRing}/cryptoKeys/state`; const now = Date.parse("2030-01-01T00:00:00Z")
    f.keys.set(name, { name, keyRing, cryptoKeyId: "state", purpose: "ENCRYPT_DECRYPT", labels: {} })
    await run(makeCryptoKeyProviderService(f.client, () => now).reconcile({ ...base, news: { keyRing, cryptoKeyId: "state", rotationPeriod: "86400s" }, olds: undefined, output: undefined }))
    expect(f.keys.get(name)).toMatchObject({ rotationPeriod: "86400s", nextRotationTime: "2030-01-02T00:00:00.000Z" })
  })
  it("converges rotation and protects CryptoKey state removal by default", async () => { const f = fake(); const p = makeCryptoKeyProviderService(f.client); const news = { keyRing: "projects/p/locations/europe/keyRings/r", cryptoKeyId: "state", rotationPeriod: "7776000s", nextRotationTime: "2030-01-01T00:00:00Z" }; const out = await run(p.reconcile({ ...base, news, olds: undefined, output: undefined })); expect(out.deletionProtection).toBe(true); await expect(run(p.delete({ ...base, olds: news, output: out }))).rejects.toBeInstanceOf(CryptoKeyDeletionProtectedError); await run(p.delete({ ...base, olds: news, output: { ...out, deletionProtection: false } })); expect(f.keys.size).toBe(1) })
  it("updates additive IAM with etag/version 3 and preserves foreign/conditional bindings", async () => { const f = fake(); const p = makeCryptoKeyIamMemberProviderService(f.client); const cryptoKey = "projects/p/locations/l/keyRings/r/cryptoKeys/k"; f.policies.set(cryptoKey, { etag: "etag", version: 1, bindings: [{ role: "roles/x", members: ["user:other"] }, { role: "roles/x", members: ["user:c"], condition: { title: "c" } }] }); const news = { cryptoKey, role: "roles/x", member: "serviceAccount:app" }; const out = await run(p.reconcile({ ...base, news, olds: undefined, output: undefined })); expect(f.policies.get(cryptoKey)).toMatchObject({ etag: "etag", version: 3 }); await run(p.delete({ ...base, olds: news, output: out })); expect(f.policies.get(cryptoKey)!.bindings).toEqual([{ role: "roles/x", members: ["user:other"] }, { role: "roles/x", members: ["user:c"], condition: { title: "c" } }]) })
  it("fails closed when IAM policy reads are forbidden", async () => { const f = fake(); const forbidden = new CloudKmsClientError({ operation: "policy", code: "forbidden" }); const p = makeCryptoKeyIamMemberProviderService({ ...f.client, getIamPolicy: () => Effect.fail(forbidden) }); const v = { cryptoKey: "k", role: "r", member: "m" }; await expect(run(p.read!({ ...base, olds: v, output: undefined }))).rejects.toBe(forbidden); await expect(run(p.reconcile({ ...base, news: v, olds: undefined, output: undefined }))).rejects.toBe(forbidden) })
})
