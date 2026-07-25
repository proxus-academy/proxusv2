import { Access, RoleAssignmentsRepository, type AccessPermission } from "@proxus/backend-domain/access-control"
import { Passwords, UserRepository, authProviderOf, makeUser, makeUserId } from "@proxus/backend-domain/auth"
import { DateTime, Effect, Option } from "effect"
import { authQaFixtures, authQaStudyPath, type AuthQaFixtureName } from "./catalog.js"

const qaPassword = "Proxus-QA-dev-2026!"
const seededAt = DateTime.toDateUtc(DateTime.makeUnsafe("2026-07-20T00:00:00.000Z"))
const globalScope = Access.scope("studyCatalog", "global")

export interface AuthQaListing {
  readonly name: AuthQaFixtureName
  readonly email: string
  readonly username: string
  readonly status: "pending" | "active" | "disabled"
  readonly provider: "email" | "google" | "both" | null
  readonly roles: readonly string[]
  readonly capabilities: readonly AccessPermission[]
  readonly studyPath: readonly string[]
}

export const seedAuthQa = (studyPath: readonly [string, string, string, string, string] = authQaStudyPath) => Effect.gen(function* () {
  const users = yield* UserRepository
  const roles = yield* RoleAssignmentsRepository
  const passwords = yield* Passwords

  for (const fixture of authQaFixtures) {
    const existing = yield* users.findByEmail(fixture.email)
    let user
    if (Option.isSome(existing)) {
      user = existing.value
    } else {
      const passwordHash = fixture.provider === "email" ? yield* passwords.hash(qaPassword) : null
      const candidate = makeUser({
        id: makeUserId(fixture.id), email: fixture.email, status: fixture.status,
        emailVerifiedAt: fixture.status === "active" ? seededAt : null,
        passwordHash, googleSubject: fixture.provider === "google" ? `qa-google:${fixture.name}` : null,
        usernameNormalized: fixture.username, birthYear: 2000,
        problemKind: "organize-study", problemOther: null,
        subjectId: studyPath[4], validatedNodeIds: studyPath,
        createdAt: seededAt, updatedAt: seededAt,
      })
      user = fixture.provider === "google"
        ? yield* users.createGoogleActive(candidate)
        : yield* users.createPending(candidate)
      if (fixture.status === "active" && user.status === "pending") user = yield* users.activate(user.id, seededAt)
    }
    const assigned = yield* roles.getRoles({ subject: Access.subject("user", user.id), scopes: [globalScope] })
    for (const role of assigned) {
      if (role !== fixture.role) {
        yield* roles.revoke({ userId: user.id, role, scope: globalScope }).pipe(
          Effect.catchTag("RoleAssignmentNotFound", () => Effect.void),
        )
      }
    }
    if (!assigned.includes(fixture.role)) {
      yield* roles.grant({ userId: user.id, role: fixture.role, scope: globalScope, grantedBy: makeUserId("40000000-0000-4000-8000-000000000001"), grantedAt: seededAt }).pipe(
        Effect.catchTag("DuplicateRoleAssignment", () => Effect.void),
      )
    }
  }
})

export const listAuthQa = Effect.gen(function* () {
  const users = yield* UserRepository
  const roles = yield* RoleAssignmentsRepository
  const result: AuthQaListing[] = []
  for (const fixture of authQaFixtures) {
    const found = yield* users.findByEmail(fixture.email)
    if (Option.isNone(found)) continue
    const user = found.value
    const assigned = yield* roles.getRoles({ subject: Access.subject("user", user.id), scopes: [globalScope] })
    result.push({
      name: fixture.name, email: user.email, username: user.usernameNormalized,
      status: user.status, provider: authProviderOf(user), roles: assigned,
      capabilities: [...Access.permissionsForRoles(assigned)].sort(),
      studyPath: [...user.validatedNodeIds],
    })
  }
  return result as readonly AuthQaListing[]
})
