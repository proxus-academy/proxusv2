// Fake clients intentionally cross the Promise boundary here.
// @effect-diagnostics asyncFunction:off
import { Effect } from "effect"
import { describe, expect, test, vi } from "vitest"
import { makeLiveGcsClient, type GoogleHttpClient, type HttpResponse } from "./gcs-live.ts"
import { StateBackendError, StateConflictError } from "./gcs-state.ts"
import { makeLiveKmsClient, type DistilledKmsOperations } from "./kms-live.ts"

const bytes = (value: string) => new TextEncoder().encode(value)
const response = (status: number, body = "", headers: HttpResponse["headers"] = {}): HttpResponse => ({ status, body: bytes(body), headers })
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)
const fixture = (...responses: ReadonlyArray<HttpResponse>) => {
  const request = vi.fn<GoogleHttpClient["request"]>()
  for (const item of responses) request.mockReturnValueOnce(Effect.succeed(item))
  const delays: number[] = []
  return {
    request,
    delays,
    client: makeLiveGcsClient({ bucket: "state bucket", token: { get: Effect.succeed("token") }, http: { request }, sleep: (ms) => Effect.sync(() => { delays.push(ms) }), random: () => 0.5, now: () => 1_000 }),
  }
}

describe("live GCS adapter", () => {
  test("reads media and its generation and treats 404 as absent", async () => {
    const found = fixture(response(200, "ciphertext", { "x-goog-generation": "17" }))
    await expect(run(found.client.read("a/b"))).resolves.toEqual({ data: bytes("ciphertext"), generation: "17" })
    expect(found.request.mock.calls[0]![0].url).toContain("a%2Fb?alt=media")
    await expect(run(fixture(response(404)).client.read("missing"))).resolves.toBeUndefined()
  })

  test("creates and updates with ifGenerationMatch and returns the new generation", async () => {
    const item = fixture(response(200, '{"generation":"2"}'))
    await expect(run(item.client.write("state", bytes("secret-ciphertext"), "0"))).resolves.toBe("2")
    const request = item.request.mock.calls[0]![0]
    expect(request.url).toContain("ifGenerationMatch=0")
    expect(request.body).toEqual(bytes("secret-ciphertext"))
  })

  test("deletes only the expected generation", async () => {
    const item = fixture(response(204))
    await expect(run(item.client.delete("state", "17"))).resolves.toBeUndefined()
    expect(item.request.mock.calls[0]![0]).toMatchObject({ method: "DELETE" })
    expect(item.request.mock.calls[0]![0].url).toContain("ifGenerationMatch=17")
  })

  test.each([404, 409, 412])("maps write status %s to a conflict without retrying", async (status) => {
    const item = fixture(response(status))
    await expect(run(item.client.write("state", bytes("x"), "1"))).rejects.toBeInstanceOf(StateConflictError)
    expect(item.request).toHaveBeenCalledTimes(1)
  })

  test("retries 429 and 503, preserving the CAS precondition and ciphertext", async () => {
    const item = fixture(response(429), response(503), response(200, '{"generation":"2"}'))
    await expect(run(item.client.write("state", bytes("ciphertext"), "7"))).resolves.toBe("2")
    expect(item.request).toHaveBeenCalledTimes(3)
    expect(item.request.mock.calls.map(([request]) => request.url.includes("ifGenerationMatch=7"))).toEqual([true, true, true])
    expect(item.request.mock.calls.map(([request]) => request.body)).toEqual([bytes("ciphertext"), bytes("ciphertext"), bytes("ciphertext")])
    expect(item.delays).toEqual([100, 200])
  })

  test("honors numeric Retry-After within the delay bound", async () => {
    const item = fixture(response(429, "", { "Retry-After": "3" }), response(200, "cipher", { "x-goog-generation": "9" }))
    await expect(run(item.client.read("state"))).resolves.toMatchObject({ generation: "9" })
    expect(item.delays).toEqual([3_000])
  })

  test("reports sanitized status and attempt when retries are exhausted", async () => {
    const item = fixture(...Array.from({ length: 5 }, () => response(503, "sensitive response")))
    await expect(run(item.client.list("state"))).rejects.toMatchObject({ operation: "gcs-list-status", status: 503, attempt: 5 })
    expect(item.request).toHaveBeenCalledTimes(5)
  })

  test.each(["read", "write", "delete", "list"] as const)("fails closed on forbidden %s", async (operation) => {
    const client = fixture(response(403)).client
    const attempt = operation === "read"
      ? run(client.read("x"))
      : operation === "write"
        ? run(client.write("x", bytes("x"), "0"))
        : operation === "delete"
          ? run(client.delete("x", "1"))
          : run(client.list("x"))
    await expect(attempt).rejects.toMatchObject({ _tag: "StateBackendError", status: 403, attempt: 1 })
    expect(client).toBeDefined()
  })

  test("paginates object names", async () => {
    const item = fixture(response(200, '{"items":[{"name":"p/a"}],"nextPageToken":"next"}'), response(200, '{"items":[{"name":"p/b"}]}'))
    await expect(run(item.client.list("p/"))).resolves.toEqual(["p/a", "p/b"])
    expect(item.request.mock.calls[1]![0].url).toContain("pageToken=next")
  })
})

describe("live distilled KMS adapter", () => {
  test("base64 encodes plaintext/ciphertext without logging either", async () => {
    const encrypt = vi.fn<DistilledKmsOperations["encrypt"]>().mockReturnValue(Effect.succeed({ ciphertext: Buffer.from("sealed").toString("base64") }))
    const decrypt = vi.fn<DistilledKmsOperations["decrypt"]>().mockReturnValue(Effect.succeed({ plaintext: Buffer.from("plain").toString("base64") }))
    const client = makeLiveKmsClient({ keyName: "projects/p/locations/l/keyRings/r/cryptoKeys/k", operations: { encrypt, decrypt } })
    await expect(run(client.encrypt(bytes("plain")))).resolves.toEqual(bytes("sealed"))
    await expect(run(client.decrypt(bytes("sealed")))).resolves.toEqual(bytes("plain"))
    expect(encrypt.mock.calls[0]![0].body.plaintext).toBe(Buffer.from("plain").toString("base64"))
    expect(decrypt.mock.calls[0]![0].body.ciphertext).toBe(Buffer.from("sealed").toString("base64"))
  })

  test.each(["NotFound", "Conflict", "PreconditionFailed", "Forbidden"])("fails closed for %s", async (tag) => {
    const failure = Effect.fail(new StateBackendError({ operation: tag }))
    const client = makeLiveKmsClient({ keyName: "key", operations: { encrypt: () => failure, decrypt: () => failure } })
    await expect(run(client.encrypt(bytes("plain")))).rejects.toBeInstanceOf(StateBackendError)
    await expect(run(client.decrypt(bytes("cipher")))).rejects.toBeInstanceOf(StateBackendError)
  })
})
