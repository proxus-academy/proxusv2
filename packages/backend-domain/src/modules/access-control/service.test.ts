// Vitest owns the Promise runtime and these Effect provisions are test entry points.
// @effect-diagnostics asyncFunction:off strictEffectProvide:off
import { DateTime, Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { Access } from "./access.js"
import { Forbidden, RoleStoreError } from "./engine/index.js"
import { AccessControlService, AccessControlServiceLive, DuplicateRoleAssignment, InvalidRoleScope, LastAdministrator, RoleAssignmentStoreError, RoleAssignmentsRepository, makeMemoryRoleAssignmentsRepository, type RoleAssignment } from "./service.js"

const admin = Access.subject("user", "00000000-0000-4000-8000-000000000001")
const editor = Access.subject("user", "00000000-0000-4000-8000-000000000002")
const global = Access.scope("studyCatalog", "global")
const nodeScope = Access.scope("studyNode", "00000000-0000-4000-8000-000000000010")
const at = DateTime.toDateUtc(DateTime.makeUnsafe(0))
const assignment = (userId: string, role: RoleAssignment["role"], scope: RoleAssignment["scope"]): RoleAssignment => ({ userId, role, scope, grantedBy: admin.id, grantedAt: at })
const run = <A, E>(initial: readonly RoleAssignment[], effect: Effect.Effect<A, E, AccessControlService>) => Effect.runPromise(effect.pipe(Effect.provide(AccessControlServiceLive.pipe(Layer.provide(makeMemoryRoleAssignmentsRepository(initial))))))

describe("AccessControlService memory contract", () => {
  test("global roles apply to resources and resource roles stay local", async () => {
    const node = Access.resource("studyNode", nodeScope.id, { scopes: [global] })
    expect(await run([assignment(editor.id, "catalog-editor", global)], AccessControlService.pipe(Effect.flatMap((service) => service.capabilities(editor, node))))).toContain("studyNode:rename")
    expect(await run([assignment(editor.id, "catalog-editor", nodeScope)], AccessControlService.pipe(Effect.flatMap((service) => service.require(editor, "studyNode:rename", node))))).toBeUndefined()
    const other = Access.resource("studyNode", "00000000-0000-4000-8000-000000000011", { scopes: [global] })
    await expect(run([assignment(editor.id, "catalog-editor", nodeScope)], AccessControlService.pipe(Effect.flatMap((service) => service.require(editor, "studyNode:rename", other))))).rejects.toBeInstanceOf(Forbidden)
  })

  test("rejects duplicate and invalid scoped assignments", async () => {
    const initial = [assignment(admin.id, "admin", global)]
    const grant = (value: Omit<RoleAssignment, "grantedBy" | "grantedAt">) => AccessControlService.pipe(Effect.flatMap((service) => service.grantRole(admin, value, at)))
    await expect(run(initial, grant({ userId: admin.id, role: "admin", scope: global }))).rejects.toBeInstanceOf(DuplicateRoleAssignment)
    await expect(run(initial, grant({ userId: editor.id, role: "admin", scope: nodeScope }))).rejects.toBeInstanceOf(InvalidRoleScope)
  })

  test("does not revoke the last global administrator", async () => {
    const revoke = AccessControlService.pipe(Effect.flatMap((service) => service.revokeRole(admin, { userId: admin.id, role: "admin", scope: global })))
    await expect(run([assignment(admin.id, "admin", global)], revoke)).rejects.toBeInstanceOf(LastAdministrator)
  })

  test("preserves RoleStore failures instead of converting them to forbidden", async () => {
    const failed = Layer.succeed(RoleAssignmentsRepository, RoleAssignmentsRepository.of({
      getRoles: () => Effect.fail(new RoleAssignmentStoreError({ operation: "getRoles" })),
      grant: () => Effect.void, revoke: () => Effect.void, countAdmins: () => Effect.succeed(1)
    }))
    const layer = AccessControlServiceLive.pipe(Layer.provide(failed))
    const check = AccessControlService.pipe(Effect.flatMap((service) => service.require(editor, "studyCatalog:createNode", Access.resource("studyCatalog", "global"))))
    await expect(Effect.runPromise(check.pipe(Effect.provide(layer)))).rejects.toBeInstanceOf(RoleStoreError)
  })
})
