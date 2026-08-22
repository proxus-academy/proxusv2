import type { AccountId } from "@proxus/shared/auth"
import type { UgcCommand, UgcWorkspace } from "@proxus/shared/ugc-management"
import { Context, Effect } from "effect"

export type UgcServiceError =
  | import("@proxus/shared/ugc-management").UgcEntityNotFound
  | import("@proxus/shared/ugc-management").UgcConflict
  | import("@proxus/shared/ugc-management").UgcInvalidTransition
  | import("@proxus/shared/access-control").Forbidden
  | import("./repository.js").UgcRepositoryError
  | import("./repository.js").UgcOptimisticConflict

export interface UgcManagementServiceContract {
  readonly workspace: (authUserId: AccountId, admin?: boolean) => Effect.Effect<UgcWorkspace, UgcServiceError>
  readonly execute: (authUserId: AccountId, command: UgcCommand, admin?: boolean) => Effect.Effect<UgcWorkspace, UgcServiceError>
}

export class UgcManagementService extends Context.Service<UgcManagementService, UgcManagementServiceContract>()(
  "@proxus/backend-domain/modules/ugc-management/service/UgcManagementService",
) {}
