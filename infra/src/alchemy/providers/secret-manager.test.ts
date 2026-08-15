// @effect-diagnostics asyncFunction:off strictBooleanExpressions:off anyUnknownInErrorContext:off
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { Unowned } from "alchemy/AdoptPolicy"
import type { ScopedPlanStatusSession } from "alchemy/Cli/Cli"
import { ownerLabelValue } from "./owner-label.ts"
import {
  SecretManagerClientError,
  makeSecretIamMemberProviderService,
  makeSecretProviderService,
  type IamPolicy,
  type SecretManagerClient,
  type SecretMetadata,
} from "./secret-manager.ts"

const run = Effect.runPromise
const session = { note: () => Effect.void } as unknown as ScopedPlanStatusSession
const base = { id: "Db", fqn: "prod/Db", instanceId: "i", session, bindings: [] }

const fakeClient = () => {
  const secrets = new Map<string, SecretMetadata>()
  const policies = new Map<string, IamPolicy>()
  const calls: string[] = []
  const fail = (operation: string) => Effect.fail(new SecretManagerClientError({ operation, code: "not-found" }))
  const client: SecretManagerClient = {
    getSecret: (name) => { calls.push(`get:${name}`); const item = secrets.get(name); return item ? Effect.succeed(item) : fail("get") },
    listSecrets: () => Effect.succeed([...secrets.values()]),
    createSecret: (input) => { calls.push("create"); const name = `projects/${input.project}/secrets/${input.secretId}`; const item = { ...input, name }; secrets.set(name, item); return Effect.succeed(item) },
    updateSecret: (input) => { calls.push("update"); const old = secrets.get(input.name); if (!old) return fail("update"); const item = { ...old, labels: input.labels }; secrets.set(input.name, item); return Effect.succeed(item) },
    deleteSecret: (name) => { calls.push("delete"); return secrets.delete(name) ? Effect.void : fail("delete") },
    getIamPolicy: (name) => { calls.push("getPolicy"); return Effect.succeed(policies.get(name) ?? { bindings: [] }) },
    setIamPolicy: (name, policy) => { calls.push("setPolicy"); policies.set(name, policy); return Effect.void },
  }
  return { client, secrets, policies, calls }
}

describe("Secret provider", () => {
  it("creates, reads, lists, updates and deletes idempotently", async () => {
    const f = fakeClient(); const provider = makeSecretProviderService(f.client)
    const news = { project: "p", secretId: "database", labels: { env: "prod" } }
    const output = await run(provider.reconcile({ ...base, news, olds: undefined, output: undefined }))
    expect(output.labels).toEqual({ env: "prod", proxus_alchemy_fqn: ownerLabelValue(base.fqn) })
    expect(output.labels.proxus_alchemy_fqn).toMatch(/^[a-z0-9_-]{1,63}$/)
    await run(provider.reconcile({ ...base, news, olds: news, output }))
    expect(f.calls.filter((c) => c === "create")).toHaveLength(1)
    expect(await run(provider.read!({ ...base, olds: news, output }))).toEqual(output)
    expect(await run(provider.list())).toEqual([output])
    const updated = await run(provider.reconcile({ ...base, news: { ...news, labels: { env: "next" } }, olds: news, output }))
    expect(updated.labels.env).toBe("next")
    await expect(run(provider.delete({ ...base, olds: news, output: updated }))).rejects.toMatchObject({ operation: "delete-protected-secret" })
    const deletable = { ...updated, deletionProtection: false }
    await run(provider.delete({ ...base, olds: news, output: deletable }))
    await run(provider.delete({ ...base, olds: news, output: deletable }))
    expect(f.secrets.size).toBe(0)
  })

  it("propagates forbidden as a typed operational error from read, list, reconcile and delete", async () => {
    const f = fakeClient()
    const forbidden = (operation: string) => Effect.fail(new SecretManagerClientError({ operation, code: "forbidden" }))
    const provider = makeSecretProviderService({
      ...f.client,
      getSecret: () => forbidden("get"),
      listSecrets: () => forbidden("list"),
      deleteSecret: () => forbidden("delete"),
    })
    const value = { project: "p", secretId: "database" }
    const output = { ...value, name: "projects/p/secrets/database", labels: {}, deletionProtection: true }

    for (const effect of [
      provider.read!({ ...base, olds: value, output: undefined }),
      provider.list(),
      provider.reconcile({ ...base, news: value, olds: undefined, output: undefined }),
      provider.delete({ ...base, olds: value, output }),
    ]) {
      await expect(run(effect)).rejects.toMatchObject({ _tag: "SecretManagerClientError", code: "forbidden" })
    }
  })

  it("keeps a numeric live resource name on the same logical identity without replacement", async () => {
    const f = fakeClient(); const provider = makeSecretProviderService(f.client)
    const desired = { project: "proxus-v2", secretId: "s", deletionProtection: true }
    const output = { ...desired, project: "474767709287", name: "projects/474767709287/secrets/s", labels: {}, etag: "etag" }
    expect(await run(provider.diff!({ ...base, olds: desired, news: desired, output, oldBindings: [], newBindings: [] }))).toBeUndefined()
  })

  it("marks foreign secrets unowned and detects replacement", async () => {
    const f = fakeClient(); const provider = makeSecretProviderService(f.client)
    f.secrets.set("projects/p/secrets/s", { name: "projects/p/secrets/s", project: "p", secretId: "s", labels: {} })
    const read = await run(provider.read!({ ...base, olds: { project: "p", secretId: "s" }, output: undefined }))
    expect(Unowned.is(read)).toBe(true)
    expect(await run(provider.diff!({ ...base, olds: { project: "p", secretId: "s" }, news: { project: "q", secretId: "s" }, output: undefined, oldBindings: [], newBindings: [] }))).toEqual({ action: "replace" })
  })
})

describe("SecretIamMember provider", () => {
  it("adds and removes only its member while preserving foreign and conditional bindings", async () => {
    const f = fakeClient(); const provider = makeSecretIamMemberProviderService(f.client); const secret = "projects/p/secrets/s"
    f.policies.set(secret, { etag: "x", version: 3, bindings: [
      { role: "roles/secretmanager.secretAccessor", members: ["user:other"] },
      { role: "roles/secretmanager.secretAccessor", members: ["user:conditional"], condition: { title: "c" } },
    ] })
    const news = { secret, role: "roles/secretmanager.secretAccessor", member: "serviceAccount:app" }
    const output = await run(provider.reconcile({ ...base, news, olds: undefined, output: undefined }))
    await run(provider.reconcile({ ...base, news, olds: news, output }))
    expect(f.calls.filter((c) => c === "setPolicy")).toHaveLength(1)
    expect(await run(provider.read!({ ...base, olds: news, output }))).toEqual(news)
    await run(provider.delete({ ...base, olds: news, output }))
    const policy = f.policies.get(secret)!
    expect(policy.etag).toBe("x")
    expect(policy.bindings).toEqual([
      { role: news.role, members: ["user:other"] },
      { role: news.role, members: ["user:conditional"], condition: { title: "c" } },
    ])
    await run(provider.delete({ ...base, olds: news, output }))
    expect(await run(provider.list())).toEqual([])
  })

  it("propagates forbidden policy reads instead of treating the membership as absent", async () => {
    const f = fakeClient()
    const forbidden = new SecretManagerClientError({ operation: "get-policy", code: "forbidden" })
    const provider = makeSecretIamMemberProviderService({ ...f.client, getIamPolicy: () => Effect.fail(forbidden) })
    const value = { secret: "projects/p/secrets/s", role: "roles/secretmanager.secretAccessor", member: "serviceAccount:app" }

    await expect(run(provider.read!({ ...base, olds: value, output: undefined }))).rejects.toBe(forbidden)
    await expect(run(provider.reconcile({ ...base, news: value, olds: undefined, output: undefined }))).rejects.toBe(forbidden)
    await expect(run(provider.delete({ ...base, olds: value, output: value }))).rejects.toBe(forbidden)
  })

  it("detects immutable changes", async () => {
    const f = fakeClient(); const provider = makeSecretIamMemberProviderService(f.client)
    const old = { secret: "projects/p/secrets/a", role: "roles/a", member: "user:a" }
    expect(await run(provider.diff!({ ...base, olds: old, news: { ...old, member: "user:b" }, output: old, oldBindings: [], newBindings: [] }))).toEqual({ action: "replace" })
  })
})
