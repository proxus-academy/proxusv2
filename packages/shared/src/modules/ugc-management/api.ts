import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"
import { Forbidden } from "../access-control/api.js"
import { SessionAuthorization } from "../auth/middleware.js"
import { UgcCommand } from "./commands.js"
import { UgcWorkspace } from "./model.js"

export class UgcEntityNotFound extends Schema.TaggedErrorClass<UgcEntityNotFound>()("UgcEntityNotFound", {
  entity: Schema.String,
  id: Schema.String,
}, { httpApiStatus: 404 }) {}

export class UgcConflict extends Schema.TaggedErrorClass<UgcConflict>()("UgcConflict", {
  message: Schema.String,
}, { httpApiStatus: 409 }) {}

export class UgcInvalidTransition extends Schema.TaggedErrorClass<UgcInvalidTransition>()("UgcInvalidTransition", {
  message: Schema.String,
}, { httpApiStatus: 422 }) {}

const errors = [
  UgcEntityNotFound,
  UgcConflict,
  UgcInvalidTransition,
  Forbidden,
  HttpApiError.InternalServerErrorNoContent,
] as const

export const UgcCommandRequest = Schema.Struct({ command: UgcCommand })

export class PublicUgcApi extends HttpApiGroup.make("publicUgc")
  .add(
    HttpApiEndpoint.get("workspace", "/workspace", { success: UgcWorkspace, error: errors }),
    HttpApiEndpoint.post("command", "/commands", { payload: UgcCommandRequest, success: UgcWorkspace, error: errors }),
  )
  .prefix("/ugc")
  .middleware(SessionAuthorization) {}

export class AdminUgcApi extends HttpApiGroup.make("adminUgc")
  .add(
    HttpApiEndpoint.get("workspace", "/workspace", { success: UgcWorkspace, error: errors }),
    HttpApiEndpoint.post("command", "/commands", { payload: UgcCommandRequest, success: UgcWorkspace, error: errors }),
  )
  .prefix("/admin/ugc")
  .middleware(SessionAuthorization) {}
