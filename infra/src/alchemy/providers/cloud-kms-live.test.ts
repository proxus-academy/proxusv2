// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { makeLiveCloudKmsClient, type DistilledCloudKmsOperations } from "./cloud-kms-live.ts"

const uncalled = () => Effect.die("unexpected operation")
const operations = (overrides: Partial<DistilledCloudKmsOperations>): DistilledCloudKmsOperations => ({
  getRing: uncalled, listRings: uncalled, createRing: uncalled,
  getKey: uncalled, listKeys: uncalled, createKey: uncalled, patchKey: uncalled,
  getPolicy: uncalled, setPolicy: uncalled, ...overrides,
})
const runError = async (effect: Effect.Effect<unknown, unknown>) => Effect.runPromise(Effect.flip(effect))
const ring = "projects/proxus/locations/europe-southwest1/keyRings/state"

describe("Cloud KMS live adapter observability", () => {
  it("maps the live CryptoKey schedule shape from the distilled schema", async () => {
    const name = `${ring}/cryptoKeys/key`
    const client = makeLiveCloudKmsClient({ project: "proxus", operations: operations({ getKey: () => Effect.succeed({ name, purpose: "ENCRYPT_DECRYPT", rotationPeriod: "7776000s", nextRotationTime: "2030-01-01T00:00:00Z" }) }) })
    await expect(Effect.runPromise(client.getCryptoKey(name))).resolves.toMatchObject({ name, rotationPeriod: "7776000s", nextRotationTime: "2030-01-01T00:00:00Z" })
  })

  it("patches a changed schedule with the required next rotation and exact update mask", async () => {
    const name = `${ring}/cryptoKeys/key`; let request: unknown
    const client = makeLiveCloudKmsClient({ project: "proxus", operations: operations({ patchKey: (value) => { request = value; return Effect.succeed({ ...value.body, purpose: "ENCRYPT_DECRYPT" }) } }) })
    await Effect.runPromise(client.updateCryptoKey({ name, labels: {}, rotationPeriod: "7776000s", nextRotationTime: "2030-01-01T00:00:00.000Z", updateMask: ["rotation_period", "next_rotation_time"] }))
    expect(request).toEqual({ name, updateMask: "rotation_period,next_rotation_time", body: { name, rotationPeriod: "7776000s", nextRotationTime: "2030-01-01T00:00:00.000Z" } })
  })

  it("preserves sanitized 403 GCP diagnostics and fails closed", async () => {
    const cause = { _tag: "Forbidden", status: 403, code: "PERMISSION_DENIED", message: "Permission denied; token=top-secret", headers: { authorization: "Bearer top-secret" }, body: { access_token: "top-secret" } }
    const client = makeLiveCloudKmsClient({ project: "proxus", operations: operations({ getRing: () => Effect.fail(cause) }) })
    const error = await runError(client.getKeyRing(ring))
    expect(error).toMatchObject({ code: "forbidden", status: 403, operation: "get-key-ring", resource: ring, gcpCode: "PERMISSION_DENIED", message: "Permission denied; token=[REDACTED]" })
    expect(JSON.stringify(error)).not.toContain("top-secret")
    expect(error).not.toHaveProperty("headers")
    expect(error).not.toHaveProperty("body")
  })

  it("preserves nested 400 GCP code and message for a fake mutation", async () => {
    const client = makeLiveCloudKmsClient({ project: "proxus", operations: operations({ createRing: () => Effect.fail({ statusCode: 400, error: { code: "INVALID_ARGUMENT", message: "keyRingId is malformed" }, response: { headers: { cookie: "secret" }, body: "secret" } }) }) })
    await expect(runError(client.createKeyRing("projects/proxus/locations/europe-southwest1", "bad"))).resolves.toMatchObject({ code: "invalid", status: 400, operation: "create-key-ring", resource: ring.replace("state", "bad"), gcpCode: "INVALID_ARGUMENT", message: "keyRingId is malformed" })
  })

  it("reports invalid response schemas without exposing the response", async () => {
    const client = makeLiveCloudKmsClient({ project: "proxus", operations: operations({ getRing: () => Effect.succeed({ name: "invalid", secret: "must-not-leak" }) }) })
    const error = await runError(client.getKeyRing(ring))
    expect(error).toMatchObject({ operation: "get-key-ring", resource: ring, gcpCode: "InvalidResponseSchema", message: "Cloud KMS returned an invalid response schema" })
    expect(JSON.stringify(error)).not.toContain("must-not-leak")
  })

  it("retains safe network diagnostics without attaching the cause", async () => {
    const cause = { _tag: "RequestError", message: "fetch failed for https://kms.test/x?access_token=network-secret", request: { headers: { authorization: "Bearer network-secret" } } }
    const client = makeLiveCloudKmsClient({ project: "proxus", operations: operations({ getRing: () => Effect.fail(cause) }) })
    const error = await runError(client.getKeyRing(ring))
    expect(error).toMatchObject({ code: "unknown", operation: "get-key-ring", resource: ring, gcpCode: "RequestError", message: "fetch failed for https://kms.test/x?access_token=[REDACTED]" })
    expect(JSON.stringify(error)).not.toContain("network-secret")
    expect(error).not.toHaveProperty("cause")
  })
})
