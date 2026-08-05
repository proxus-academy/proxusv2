import { AccessControlService, type Forbidden, type RoleStoreError, type Subject } from "../access-control/index.js"
import { AdminUser } from "@proxus/shared/admin-users"
import { Context, Effect, Layer, Schema } from "effect"
import { authProviderOf, type User, type UserId } from "./model.js"
import { AuthRepositoryError, InvalidRepositoryState, UserNotFound, UserRepository } from "./repositories.js"

const decodeView = Schema.decodeUnknownSync(AdminUser)
const view = (user: User) => decodeView({
  id: user.id,
  email: user.email,
  username: user.usernameNormalized,
  status: user.status,
  provider: authProviderOf(user) ?? "none",
  emailVerified: user.emailVerifiedAt !== null,
  birthYear: user.birthYear,
  problemKind: user.problemKind,
  acquisitionSource: user.acquisitionSource,
  studyId: user.studyId,
  subjectId: user.subjectId,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
})

export type AdminUsersError = Forbidden | RoleStoreError | AuthRepositoryError | UserNotFound | InvalidRepositoryState

export class AdminUsersService extends Context.Service<AdminUsersService, {
  readonly list: (actor: Subject) => Effect.Effect<ReadonlyArray<AdminUser>, AdminUsersError>
  readonly updateStatus: (actor: Subject, userId: UserId, status: "active" | "disabled", at: Date) => Effect.Effect<AdminUser, AdminUsersError>
}>()("@proxus/backend-domain/modules/auth/admin-users/AdminUsersService") {}

export const AdminUsersServiceLive = Layer.effect(AdminUsersService, Effect.gen(function*() {
  const access = yield* AccessControlService
  const users = yield* UserRepository
  const authorize = (actor: Subject) => access.requireAdministrator(actor)
  return AdminUsersService.of({
    list: (actor) => authorize(actor).pipe(
      Effect.andThen(users.listAll()),
      Effect.map((all) => all.map(view)),
    ),
    updateStatus: (actor, userId, status, at) => authorize(actor).pipe(
      Effect.andThen(status === "disabled" ? users.disable(userId, at) : users.enable(userId, at)),
      Effect.map(view),
    ),
  })
}))
