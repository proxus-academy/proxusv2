// @effect-diagnostics asyncFunction:off
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { mutateIamPolicy } from "./iam-policy-mutation.ts"

type Policy = { etag: string; bindings: ReadonlyArray<{ role: string; members: ReadonlyArray<string>; condition?: unknown }> }
type Failure = { readonly code: "conflict" | "forbidden" }

const run = <A>(effect: Effect.Effect<A, Failure>) => Effect.runPromise(effect)

describe("IAM policy mutation coordination", () => {
  for (const kind of ["project", "bigquery", "secret"] as const) {
    it(`preserves 20 concurrent grants from two ${kind} clients`, async () => {
      let revision = 1
      let policy: Policy = { etag: "1", bindings: [{ role: "roles/foreign", members: ["user:owner"], condition: { title: "keep" } }] }
      const client = () => ({
        read: () => Effect.sync(() => structuredClone(policy)),
        write: (next: Policy) => Effect.suspend(() => {
          if (next.etag !== String(revision)) return Effect.fail({ code: "conflict" } as const)
          revision++
          policy = { ...structuredClone(next), etag: String(revision) }
          return Effect.void
        }),
      })
      const clients = [client(), client()]
      await run(Effect.all(Array.from({ length: 20 }, (_, index) => {
        const member = `user:${index}@example.test`
        const selected = clients[index % 2]!
        return mutateIamPolicy({ resource: `${kind}:shared`, read: selected.read, write: selected.write, change: (current) => ({ ...current, bindings: [...current.bindings, { role: "roles/test", members: [member] }] }) })
      }), { concurrency: "unbounded" }))
      expect(policy.bindings.filter((binding) => binding.role === "roles/test").flatMap((binding) => binding.members)).toHaveLength(20)
      expect(policy.bindings[0]).toMatchObject({ condition: { title: "keep" } })
    })
  }

  it("re-reads and merges after an etag conflict, but never retries permanent failures", async () => {
    let reads = 0
    let writes = 0
    const read = () => Effect.sync((): Policy => ({ etag: String(++reads), bindings: [] }))
    await run(mutateIamPolicy({ resource: "project:conflict", read, change: (p) => p, write: () => ++writes === 1 ? Effect.fail({ code: "conflict" } as const) : Effect.void }))
    expect({ reads, writes }).toEqual({ reads: 2, writes: 2 })
    reads = 0; writes = 0
    await expect(run(mutateIamPolicy({ resource: "project:forbidden", read, change: (p) => p, write: () => { writes++; return Effect.fail({ code: "forbidden" } as const) } }))).rejects.toMatchObject({ code: "forbidden" })
    expect({ reads, writes }).toEqual({ reads: 1, writes: 1 })
  })
})
