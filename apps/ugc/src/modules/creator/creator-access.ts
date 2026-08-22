import type { UgcWorkspace } from "@proxus/shared/ugc-management"

/**
 * Creator library pages unlock once the publishing window of the trial opens.
 * Reaching creator status keeps them available; terminal states retain read-only
 * history until their configured deadline, while pre-trial states stay locked.
 */
export function canAccessCreatorLibrary(workspace: UgcWorkspace): boolean {
  if (workspace.role === "manager") return true
  const creator = workspace.currentUser
  if (creator?.status === "creator") return true
  if (creator?.data._tag === "TerminalData") return (creator.data.previousStatus === "trial" || creator.data.previousStatus === "creator") && Date.parse(workspace.asOf) < Date.parse(creator.data.historyAvailableUntil)
  if (creator?.status !== "trial" || creator.data._tag !== "TrialData") return false
  return Date.parse(workspace.asOf) >= Date.parse(creator.data.publishingStartsAt)
}

export function canAccessCreatorProfile(workspace: UgcWorkspace): boolean {
  if (workspace.role === "manager") return true
  const creator = workspace.currentUser
  if (creator?.status === "creator" || creator?.status === "trial") return true
  return creator?.data._tag === "TerminalData" && (creator.data.previousStatus === "trial" || creator.data.previousStatus === "creator") && Date.parse(workspace.asOf) < Date.parse(creator.data.historyAvailableUntil)
}
