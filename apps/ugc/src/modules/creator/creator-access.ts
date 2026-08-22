import type { UgcWorkspace } from "@proxus/shared/ugc-management"

/**
 * Creator library pages unlock once the publishing window of the trial opens.
 * Reaching creator status keeps them available; terminal and pre-trial states do not.
 */
export function canAccessCreatorLibrary(workspace: UgcWorkspace): boolean {
  if (workspace.role === "manager") return true
  const creator = workspace.currentUser
  if (creator?.status === "creator") return true
  if (creator?.status !== "trial" || creator.data._tag !== "TrialData") return false
  return Date.parse(workspace.asOf) >= Date.parse(creator.data.publishingStartsAt)
}
