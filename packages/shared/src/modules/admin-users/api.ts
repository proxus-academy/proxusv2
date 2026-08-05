import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"
import { Forbidden } from "../access-control/api.js"
import { SessionAuthorization } from "../auth/middleware.js"
import { AccountId } from "../auth/model.js"
import { StudyNodeId } from "../study-catalog/schema.js"

export const AdminUserStatus = Schema.Literals(["pending", "active", "disabled"])

export class AdminUser extends Schema.Class<AdminUser>("AdminUser")({
  id: AccountId,
  email: Schema.String,
  username: Schema.String,
  status: AdminUserStatus,
  provider: Schema.Literals(["email", "google", "both", "none"]),
  emailVerified: Schema.Boolean,
  birthYear: Schema.Int,
  problemKind: Schema.String,
  acquisitionSource: Schema.String,
  studyId: StudyNodeId,
  subjectId: StudyNodeId,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class UpdateAdminUserStatus extends Schema.Class<UpdateAdminUserStatus>("UpdateAdminUserStatus")({
  status: Schema.Literals(["active", "disabled"]),
}) {}

const errors = [Forbidden, HttpApiError.InternalServerErrorNoContent] as const

export class AdminUsersApi extends HttpApiGroup.make("adminUsers")
  .add(
    HttpApiEndpoint.get("listUsers", "/users", {
      success: Schema.Array(AdminUser),
      error: errors,
    }),
    HttpApiEndpoint.patch("updateStatus", "/users/:userId/status", {
      params: { userId: AccountId },
      payload: UpdateAdminUserStatus,
      success: AdminUser,
      error: errors,
    }),
  )
  .prefix("/admin")
  .middleware(SessionAuthorization) {}
