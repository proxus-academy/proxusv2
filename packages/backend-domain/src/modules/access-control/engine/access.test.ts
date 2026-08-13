/** Adapted from effect-access tests at commit 134768b. */
// Vitest owns the Promise runtime and these Effect provisions are test entry points.
// @effect-diagnostics asyncFunction:off strictEffectProvide:off globalErrorInEffectFailure:off
import { describe, expect, test } from "vitest"
import { Effect, Layer, Schema } from "effect"
import { AccessDefinitionError, defineAccess, Forbidden, forbidden, resource, RoleStoreError } from "./index.js"

const makeAccess = () => defineAccess({
  permissions: { workspace: ["manage"], file: ["read", "write"] },
  roles: {
    workspaceAdmin: ["workspace:manage", "file:read", "file:write"],
    fileReader: ["file:read"]
  }
} as const)

const runWith = <A, E>(access: ReturnType<typeof makeAccess>, subject: ReturnType<typeof access.subject>, store: ReturnType<typeof access.makeRoleStore>, effect: Effect.Effect<A, E, typeof access.CurrentSubject.Identifier | typeof access.RoleStore.Identifier>) =>
  Effect.runPromise(effect.pipe(Effect.provide([
    Layer.succeed(access.CurrentSubject, subject),
    Layer.succeed(access.RoleStore, store)
  ])))

describe("internal effect-access engine", () => {
  test("authorizes roles assigned to an ancestor scope and denies missing permissions", async () => {
    const access = makeAccess()
    const user = access.subject("user", "u1")
    const workspace = access.scope("workspace", "w1")
    const file = access.resource("file", "f1", { scopes: [workspace] })
    const adminStore = access.makeRoleStore([access.roleBinding({ subject: user, scope: workspace, role: "workspaceAdmin" })])
    const readerStore = access.makeRoleStore([access.roleBinding({ subject: user, scope: access.scope("file", "f1"), role: "fileReader" })])

    await expect(runWith(access, user, adminStore, Effect.succeed("write").pipe(access["require"]("file:write", file)))).resolves.toBe("write")
    await expect(runWith(access, user, readerStore, Effect.succeed("write").pipe(access["require"]("file:write", file)))).rejects.toBeInstanceOf(Forbidden)
  })

  test("schemas accept canonical rows and reject unknown roles", async () => {
    const access = makeAccess()
    const decode = Schema.decodeUnknownEffect(access.schemas.RoleAssignmentRow)
    await expect(Effect.runPromise(decode({ subjectType: "user", subjectId: "u1", scopeType: "workspace", scopeId: "w1", role: "workspaceAdmin" }))).resolves.toMatchObject({ role: "workspaceAdmin" })
    await expect(Effect.runPromise(decode({ subjectType: "user", subjectId: "u1", scopeType: "workspace", scopeId: "w1", role: "owner" }))).rejects.toBeDefined()
  })

  test("any recovers only from Forbidden and retains denial reasons", async () => {
    const access = makeAccess()
    const first = forbidden({ message: "first" })
    const second = forbidden({ message: "second" })
    const denial = await Effect.runPromise(Effect.flip(access.any(Effect.fail(first), Effect.fail(second))))
    expect(denial).toBeInstanceOf(Forbidden)
    expect(denial.reasons).toEqual([first, second])

    const operational = new Error("database unavailable")
    await expect(Effect.runPromise(access.any(Effect.fail(first), Effect.fail(operational), Effect.void))).rejects.toBe(operational)
  })

  test("fails closed when a RoleStore fails or returns an unknown role", async () => {
    const access = makeAccess()
    const user = access.subject("user", "u1")
    const target = access.resource("file", "f1")
    const failed = { getRoles: () => Effect.fail(new Error("db")) }
    const unknown = { getRoles: () => Effect.succeed(["admin"]) }

    await expect(Effect.runPromise(access.canFor("file:read", { subject: user, resource: target }).pipe(Effect.provide(Layer.succeed(access.RoleStore, failed))))).rejects.toBeInstanceOf(RoleStoreError)
    await expect(Effect.runPromise(access.canFor("file:read", { subject: user, resource: target }).pipe(Effect.provide(Layer.succeed(access.RoleStore, unknown))))).rejects.toBeInstanceOf(RoleStoreError)
  })

  test("validates definitions, references and role bindings at runtime", () => {
    const emptyDefinition = { permissions: {}, roles: {} } satisfies { permissions: Record<string, readonly string[]>; roles: Record<string, readonly `${string}:${string}`[]> }
    const invalidReference = { permissions: { file: ["read"] }, roles: { reader: ["file:write"] } } satisfies { permissions: Record<string, readonly string[]>; roles: Record<string, readonly `${string}:${string}`[]> }
    expect(() => defineAccess(emptyDefinition)).toThrow(AccessDefinitionError)
    expect(() => defineAccess(invalidReference)).toThrow(AccessDefinitionError)
    const access = makeAccess()
    expect(() => access.subject("user", "")).toThrow(TypeError)
    expect(() => access.roleBinding({ subject: access.subject("user", "1"), scope: access.scope("file", "1"), role: "unknown" })).toThrow(TypeError)
  })

  test("deduplicates bindings, scopes, roles and permissions", async () => {
    const access = makeAccess()
    const user = access.subject("user", "1")
    const fileScope = access.scope("file", "1")
    const binding = access.roleBinding({ subject: user, scope: fileScope, role: "fileReader" })
    const store = access.makeRoleStore([binding, binding])
    await expect(Effect.runPromise(store.getRoles({ subject: user, scopes: [fileScope, fileScope] }))).resolves.toEqual(["fileReader"])
    expect([...access.permissionsForRoles(["fileReader", "fileReader"])]).toEqual(["file:read"])
  })
})
