import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeEmbeddedAdminAuthorizationMatrix } from "./test/http/embedded.js"

describe("admin embedded HTTP API", () => {
  test("proves the anonymous/student/editor/admin authorization matrix with real sessions and PGlite roles", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const { web, credentials } = yield* makeEmbeddedAdminAuthorizationMatrix
      const request = (path: string, init?: RequestInit) => Effect.promise(() =>
        web.handler(new Request(`http://proxus.test${path}`, init)),
      )
      const mutation = (name: string, cookie?: string) => request("/admin/study-catalog/nodes", {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie === undefined ? undefined : { cookie }) },
        body: `{"_tag":"CreateCountry","name":"${name}"}`,
      })

      expect((yield* mutation("Anonymous matrix country")).status).toBe(401)
      expect((yield* mutation("Student matrix country", credentials.student.cookie)).status).toBe(403)
      expect((yield* mutation("Editor matrix country", credentials.editor.cookie)).status).toBe(201)
      expect((yield* mutation("Admin matrix country", credentials.admin.cookie)).status).toBe(201)

      const expectedPermissions = [
        "studyCatalog:connect", "studyCatalog:createNode", "studyEdge:disconnect",
        "studyNode:archive", "studyNode:rename",
      ]
      expect((yield* request("/admin/access-control/capabilities")).status).toBe(401)
      for (const [credential, permissions] of [
        [credentials.student.cookie, []],
        [credentials.editor.cookie, expectedPermissions],
        [credentials.admin.cookie, expectedPermissions],
      ] as const) {
        const response = yield* request("/admin/access-control/capabilities", { headers: { cookie: credential } })
        expect(response.status).toBe(200)
        expect(yield* Effect.promise(() => response.json())).toEqual({ permissions })
      }

      const rolePayload = "{\"userId\":\"40000000-0000-4000-8000-000000000003\",\"role\":\"catalog-editor\",\"scopeType\":\"studyCatalog\",\"scopeId\":\"global\"}"
      const manageRole = (cookie: string) => request("/admin/access-control/roles", {
        method: "POST", headers: { "content-type": "application/json", cookie }, body: rolePayload,
      })
      expect((yield* manageRole(credentials.student.cookie)).status).toBe(403)
      expect((yield* manageRole(credentials.editor.cookie)).status).toBe(403)
      expect((yield* manageRole(credentials.admin.cookie)).status).toBe(204)
    }))),
  30_000)
})
