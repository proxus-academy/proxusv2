import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { SessionAuthorization } from "../auth/middleware.js"
import { AccountId } from "../auth/model.js"

export const AccessPermission = Schema.Literals([
  "studyCatalog:createNode", "studyCatalog:connect", "studyNode:rename",
  "studyNode:archive", "studyEdge:disconnect",
])
export const AccessRole = Schema.Literals(["admin", "catalog-editor", "student"])
export const AccessScopeType = Schema.Literals(["studyCatalog", "studyNode", "studyEdge"])

export class Forbidden extends Schema.TaggedErrorClass<Forbidden>()("Forbidden", {
  message: Schema.String,
}, { httpApiStatus: 403 }) {}

export class Capabilities extends Schema.Class<Capabilities>("Capabilities")({
  permissions: Schema.Array(AccessPermission),
}) {}

export class RoleAssignmentInput extends Schema.Class<RoleAssignmentInput>("RoleAssignmentInput")({
  userId: AccountId,
  role: AccessRole,
  scopeType: AccessScopeType,
  scopeId: Schema.String.pipe(Schema.check(Schema.isMinLength(1)), Schema.check(Schema.isMaxLength(128))),
}) {}

const errors = [Forbidden, HttpApiError.InternalServerErrorNoContent] as const
export class AdminAccessControlApi extends HttpApiGroup.make("adminAccessControl")
  .add(
    HttpApiEndpoint.get("capabilities", "/capabilities", { success: Capabilities, error: errors }),
    HttpApiEndpoint.post("grantRole", "/roles", {
      payload: RoleAssignmentInput,
      success: HttpApiSchema.NoContent,
      error: errors,
    }),
    HttpApiEndpoint.delete("revokeRole", "/roles", {
      payload: RoleAssignmentInput,
      success: HttpApiSchema.NoContent,
      error: errors,
    }),
  )
  .prefix("/admin/access-control")
  .middleware(SessionAuthorization) {}
