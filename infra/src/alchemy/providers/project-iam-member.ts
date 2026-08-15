// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Resource } from "alchemy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { DependsOn } from "../resource-dependency.ts"
import { mutateIamPolicy } from "./iam-policy-mutation.ts"

export class ProjectIamClientError extends Data.TaggedError("ProjectIamClientError")<{
  readonly operation: string
  readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "unknown"
  readonly status?: number
  readonly gcpCode?: string
  readonly message?: string
}> {}

export interface ProjectIamPolicy {
  readonly etag?: string
  readonly version?: number
  readonly bindings: ReadonlyArray<{
    readonly role: string
    readonly members: ReadonlyArray<string>
    readonly condition?: unknown
  }>
}

export interface ProjectIamClient {
  getIamPolicy(projectId: string): Effect.Effect<ProjectIamPolicy, ProjectIamClientError>
  setIamPolicy(projectId: string, policy: ProjectIamPolicy): Effect.Effect<void, ProjectIamClientError>
}

export interface ProjectIamMemberProps extends DependsOn {
  readonly projectId: string
  readonly role: string
  readonly member: string
}
export type ProjectIamMember = Resource<"Proxus.GCP.ProjectIamMember", ProjectIamMemberProps, ProjectIamMemberProps>
export const ProjectIamMember = Resource<ProjectIamMember>("Proxus.GCP.ProjectIamMember")

const publicMembers = new Set(["allUsers", "allAuthenticatedUsers"])
const valid = (value: ProjectIamMemberProps) =>
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value.projectId) && value.role.startsWith("roles/") && value.member.includes(":") && !publicMembers.has(value.member)
const has = (policy: ProjectIamPolicy, role: string, member: string) =>
  policy.bindings.some((binding) => binding.role === role && binding.condition === undefined && binding.members.includes(member))
const invalid = () => new ProjectIamClientError({ operation: "validate-project-iam-member", code: "invalid" })
const add = (policy: ProjectIamPolicy, role: string, member: string): ProjectIamPolicy | undefined => {
  if (has(policy, role, member)) return undefined
  const bindings = policy.bindings.map((binding) => ({ ...binding, members: [...binding.members] }))
  const unconditional = bindings.find((binding) => binding.role === role && binding.condition === undefined)
  if (unconditional) unconditional.members = [...unconditional.members, member]
  else bindings.push({ role, members: [member] })
  return { ...policy, version: Math.max(policy.version ?? 0, 3), bindings }
}
const remove = (policy: ProjectIamPolicy, role: string, member: string): ProjectIamPolicy | undefined => {
  if (!has(policy, role, member)) return undefined
  return { ...policy, version: Math.max(policy.version ?? 0, 3), bindings: policy.bindings.map((binding) => binding.role === role && binding.condition === undefined
    ? { ...binding, members: binding.members.filter((value) => value !== member) }
    : { ...binding, members: [...binding.members] }).filter((binding) => binding.members.length > 0) }
}

export const makeProjectIamMemberProviderService = (client: ProjectIamClient) => ProjectIamMember.Provider.of({
  stables: ["projectId", "role", "member"],
  list: () => Effect.succeed([]),
  diff: ({ news, olds, output }) => {
    if (!isResolved(news)) return Effect.void
    return Effect.succeed(((["projectId", "role", "member"] as const).some((key) => (output?.[key] ?? olds[key]) !== news[key])) ? { action: "replace" } as const : undefined)
  },
  read: ({ output, olds }) => {
    const value = { projectId: output?.projectId ?? olds.projectId, role: output?.role ?? olds.role, member: output?.member ?? olds.member }
    if (!valid(value)) return Effect.fail(invalid())
    return client.getIamPolicy(value.projectId).pipe(Effect.map((policy) => has(policy, value.role, value.member) ? value : undefined))
  },
  reconcile: ({ news }) => Effect.gen(function* () {
    if (!valid(news)) return yield* invalid()
    yield* mutateIamPolicy({ resource: `project:${news.projectId}`, read: () => client.getIamPolicy(news.projectId), change: (policy) => add(policy, news.role, news.member), write: (policy) => client.setIamPolicy(news.projectId, policy) })
    return { projectId: news.projectId, role: news.role, member: news.member }
  }),
  delete: ({ output }) => {
    if (!valid(output)) return Effect.fail(invalid())
    return mutateIamPolicy({ resource: `project:${output.projectId}`, read: () => client.getIamPolicy(output.projectId), change: (policy) => remove(policy, output.role, output.member), write: (policy) => client.setIamPolicy(output.projectId, policy) })
  },
})

export const ProjectIamMemberProvider = (client: ProjectIamClient) => Provider.succeed(ProjectIamMember, makeProjectIamMemberProviderService(client))
