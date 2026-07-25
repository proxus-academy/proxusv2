// Vitest owns the Promise boundary and each Effect.provide builds a fresh test Layer.
// @effect-diagnostics strictEffectProvide:off asyncFunction:off
import { Access, RoleAssignmentsRepository, makeMemoryRoleAssignmentsRepository } from "@proxus/backend-domain/access-control"
import { Passwords, UserRepository } from "@proxus/backend-domain/auth"
import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { makeAuthUserRepositoryMemory } from "../modules/auth/repositories.memory.js"
import { authQaFixtures } from "./catalog.js"
import { listAuthQa, seedAuthQa } from "./fixtures.js"

const TestLayer = Layer.mergeAll(
  makeAuthUserRepositoryMemory(),
  makeMemoryRoleAssignmentsRepository(),
  Layer.succeed(Passwords, Passwords.of({ hash: () => Effect.succeed("test-password-hash"), verify: () => Effect.succeed(true) })),
)

const run = <A, E>(effect: Effect.Effect<A, E, UserRepository | RoleAssignmentsRepository | Passwords>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)))

describe("auth QA fixtures", () => {
  test("a double seed is idempotent and lists every fixture without secrets", async () => {
    const rows = await run(Effect.gen(function* () {
      yield* seedAuthQa()
      yield* seedAuthQa()
      return yield* listAuthQa
    }))
    expect(rows).toHaveLength(authQaFixtures.length)
    expect(rows.map(({ name }) => name)).toEqual(authQaFixtures.map(({ name }) => name))
    const output = JSON.stringify(rows)
    expect(output).not.toMatch(/password|hash|token|secret/i)
    expect(output).not.toContain("test-password-hash")
  })

  test("reuses a reconciled catalog path whose IDs differ from the deterministic seed", async () => {
    const alternatePath = [
      "50000000-0000-4000-8000-000000000001",
      "50000000-0000-4000-8000-000000000002",
      "50000000-0000-4000-8000-000000000003",
      "50000000-0000-4000-8000-000000000004",
      "50000000-0000-4000-8000-000000000005",
    ] as const
    const rows = await run(Effect.gen(function* () {
      yield* seedAuthQa(alternatePath)
      yield* seedAuthQa(alternatePath)
      return yield* listAuthQa
    }))
    expect(rows).toHaveLength(authQaFixtures.length)
    expect(rows.every(({ studyPath }) => JSON.stringify(studyPath) === JSON.stringify(alternatePath))).toBe(true)
  })

  test("assigns only the fixture role and its exact capabilities", async () => {
    const rows = await run(Effect.gen(function* () { yield* seedAuthQa(); return yield* listAuthQa }))
    for (const row of rows) {
      const fixture = authQaFixtures.find(({ name }) => name === row.name)
      if (fixture === undefined) throw new Error(`unknown fixture ${row.name}`)
      expect(row.roles).toEqual([fixture.role])
      expect(row.capabilities).toEqual([...Access.permissionsForRoles([fixture.role])].sort())
      expect(row.studyPath).toHaveLength(5)
    }
    expect(rows.find(({ name }) => name === "pending-email")?.status).toBe("pending")
    expect(rows.find(({ name }) => name === "student-google")?.provider).toBe("google")
  })
})
