// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { makeLiveSecretManagerClient, type DistilledSecretManagerOperations } from "./secret-manager-live.ts"

const uncalled = () => Effect.die("unexpected operation")
const operations = (overrides: Partial<DistilledSecretManagerOperations>): DistilledSecretManagerOperations => ({
  get: uncalled,
  list: uncalled,
  create: uncalled,
  update: uncalled,
  delete: uncalled,
  getPolicy: uncalled,
  setPolicy: uncalled,
  ...overrides,
})

describe("Secret Manager live adapter", () => {
  it("maps metadata, paginates, and sends only metadata with optimistic etags", async () => {
    const requests: unknown[] = []
    // Real Secret Manager responses canonicalize names with the project number.
    const secret = { name: "projects/474767709287/secrets/db", labels: { env: "prod" }, replication: { automatic: {} }, createTime: "now", etag: "secret-etag" }
    const client = makeLiveSecretManagerClient({ project: "p", operations: operations({
      get: (request) => { requests.push(request); return Effect.succeed(secret) },
      list: (request) => { requests.push(request); return Effect.succeed(request.pageToken === undefined ? { secrets: [secret], nextPageToken: "next" } : { secrets: [] }) },
      create: (request) => { requests.push(request); return Effect.succeed(secret) },
      update: (request) => { requests.push(request); return Effect.succeed(secret) },
      delete: (request) => { requests.push(request); return Effect.succeed({}) },
    }) })

    expect(await Effect.runPromise(client.getSecret(secret.name))).toEqual({ name: secret.name, labels: secret.labels, createTime: "now", etag: "secret-etag", project: "p", secretId: "db" })
    expect(await Effect.runPromise(client.listSecrets())).toHaveLength(1)
    await Effect.runPromise(client.createSecret({ project: "p", secretId: "db", labels: { env: "prod" } }))
    await Effect.runPromise(client.updateSecret({ name: secret.name, labels: {}, etag: "secret-etag" }))
    await Effect.runPromise(client.deleteSecret(secret.name, "secret-etag"))

    expect(requests).toContainEqual({ parent: "projects/p", secretId: "db", body: { labels: { env: "prod" }, replication: { automatic: {} } } })
    expect(requests).toContainEqual({ name: secret.name, updateMask: "labels", body: { name: secret.name, labels: {}, etag: "secret-etag" } })
    expect(requests).toContainEqual({ name: secret.name, etag: "secret-etag" })
    expect(JSON.stringify(requests)).not.toContain("payload")
    expect(JSON.stringify(requests)).not.toContain("versions")
  })

  it("preserves IAM conditions and etag in version-3 read/modify/write requests", async () => {
    const requests: unknown[] = []
    const policy = { etag: "policy-etag", version: 3, bindings: [{ role: "roles/x", members: ["user:a"], condition: { title: "c", expression: "true" } }] }
    const client = makeLiveSecretManagerClient({ project: "p", operations: operations({
      getPolicy: (request) => { requests.push(request); return Effect.succeed(policy) },
      setPolicy: (request) => { requests.push(request); return Effect.succeed(policy) },
    }) })
    expect(await Effect.runPromise(client.getIamPolicy("projects/p/secrets/db"))).toEqual(policy)
    await Effect.runPromise(client.setIamPolicy("projects/p/secrets/db", policy))
    expect(requests[0]).toEqual({ resource: "projects/p/secrets/db", "options.requestedPolicyVersion": 3 })
    expect(requests[1]).toMatchObject({ body: { policy: { etag: "policy-etag", version: 3 }, updateMask: "bindings,etag,version" } })
  })

  it("normalizes 404 as missing and keeps 403 fail-closed", async () => {
    for (const [tag, code] of [["NotFound", "not-found"], ["Forbidden", "forbidden"]] as const) {
      const client = makeLiveSecretManagerClient({ project: "p", operations: operations({ get: () => Effect.fail({ _tag: tag }) }) })
      await expect(Effect.runPromise(client.getSecret("projects/p/secrets/db"))).rejects.toMatchObject({ code })
    }
  })
})
