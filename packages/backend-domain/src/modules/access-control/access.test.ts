// Vitest owns the Promise runtime and these Effect provisions are test entry points.
// @effect-diagnostics asyncFunction:off strictEffectProvide:off
import { describe, expect, test } from "vitest"
import { Effect, Layer, Schema } from "effect"
import { Access } from "./access.js"
import { Forbidden, RoleStoreError } from "./engine/index.js"

describe("canonical Proxus access definition", () => {
  test("contains the approved permissions, roles and scope types", async () => {
    expect([...Access.permissions.all]).toEqual([
      "studyCatalog:createNode",
      "studyCatalog:connect",
      "studyNode:rename",
      "studyNode:archive",
      "studyEdge:disconnect"
    ])
    expect([...Access.roles.all]).toEqual(["admin", "catalog-editor", "student"])

    await expect(Effect.runPromise(Schema.decodeUnknownEffect(Access.schemas.ScopeType)("studyNode"))).resolves.toBe("studyNode")
    await expect(Effect.runPromise(Schema.decodeUnknownEffect(Access.schemas.ScopeType)("unknown"))).rejects.toBeDefined()
  })

  test("a catalog editor on the global catalog scope can mutate child resources", async () => {
    const user = Access.subject("user", "editor")
    const global = Access.scope("studyCatalog", "global")
    const node = Access.resource("studyNode", "node-1", { scopes: [global] })
    const store = Access.makeRoleStore([Access.roleBinding({ subject: user, scope: global, role: "catalog-editor" })])

    await expect(Effect.runPromise(Access.canFor("studyNode:rename", { subject: user, resource: node }).pipe(
      Effect.provide(Layer.succeed(Access.RoleStore, store))
    ))).resolves.toBe(true)
  })

  test("students and unknown persisted roles fail closed", async () => {
    const user = Access.subject("user", "student")
    const global = Access.scope("studyCatalog", "global")
    const resource = Access.resource("studyCatalog", "global")
    const studentStore = Access.makeRoleStore([Access.roleBinding({ subject: user, scope: global, role: "student" })])

    await expect(Effect.runPromise(Access.policyFor("studyCatalog:createNode", { subject: user, resource }).pipe(
      Effect.provide(Layer.succeed(Access.RoleStore, studentStore))
    ))).rejects.toBeInstanceOf(Forbidden)

    const malformedStore = { getRoles: () => Effect.succeed(["super-admin"]) }
    await expect(Effect.runPromise(Access.canFor("studyCatalog:createNode", { subject: user, resource }).pipe(
      Effect.provide(Layer.succeed(Access.RoleStore, malformedStore))
    ))).rejects.toBeInstanceOf(RoleStoreError)
  })
})
