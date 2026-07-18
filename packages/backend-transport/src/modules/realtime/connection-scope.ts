import { Context, Effect, Option } from "effect"

export interface AuthenticatedRealtimePrincipal {
  readonly principalId: string
  readonly userId: string
  readonly sessionId: string
  readonly roles: ReadonlySet<string>
  readonly permissions: ReadonlySet<string>
}

export type RealtimeConnectionScope =
  | { readonly _tag: "Anonymous" }
  | ({ readonly _tag: "Authenticated" } & AuthenticatedRealtimePrincipal)

/** Auth transport adapter seam. Implementations must only return verified server-side session data. */
export class RealtimeConnectionScopeResolver extends Context.Service<RealtimeConnectionScopeResolver, {
  readonly resolve: Effect.Effect<Option.Option<AuthenticatedRealtimePrincipal>>
}>()("@proxus/backend-transport/modules/realtime/connection-scope/RealtimeConnectionScopeResolver") {}

export class PrivateRealtimeConnectionRejected {
  readonly _tag = "PrivateRealtimeConnectionRejected"
}

export const requirePrivateRealtimeScope = (
  scope: RealtimeConnectionScope,
  permission: string,
): Effect.Effect<AuthenticatedRealtimePrincipal, PrivateRealtimeConnectionRejected> =>
  scope._tag === "Authenticated" && scope.permissions.has(permission)
    ? Effect.succeed(scope)
    : Effect.fail(new PrivateRealtimeConnectionRejected())

/** Current public flag hints are intentionally anonymous; private streams must call requirePrivateRealtimeScope. */
export const anonymousRealtimeScope: RealtimeConnectionScope = { _tag: "Anonymous" }
