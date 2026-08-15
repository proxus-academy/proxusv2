// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Resource } from "alchemy"
import { Unowned } from "alchemy/AdoptPolicy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { ownerLabel, ownerLabelValue } from "./owner-label.ts"
import type { DependsOn } from "../resource-dependency.ts"
import { mutateIamPolicy } from "./iam-policy-mutation.ts"

/** Cloud failures are deliberately normalized so vendor response bodies cannot leak. */
export class SecretManagerClientError extends Data.TaggedError("SecretManagerClientError")<{
  readonly operation: string
  readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "unknown"
  readonly status?: number
  readonly gcpCode?: string
  readonly message?: string
}> {}

export interface SecretMetadata {
  readonly name: string
  readonly project: string
  readonly secretId: string
  readonly labels: Readonly<Record<string, string>>
  readonly createTime?: string
  readonly etag?: string
}

export interface IamPolicy {
  readonly etag?: string
  readonly version?: number
  readonly bindings: ReadonlyArray<{
    readonly role: string
    readonly members: ReadonlyArray<string>
    readonly condition?: unknown
  }>
}

export interface SecretManagerClient {
  getSecret(name: string): Effect.Effect<SecretMetadata, SecretManagerClientError>
  listSecrets(): Effect.Effect<ReadonlyArray<SecretMetadata>, SecretManagerClientError>
  createSecret(input: {
    readonly project: string
    readonly secretId: string
    readonly labels: Readonly<Record<string, string>>
  }): Effect.Effect<SecretMetadata, SecretManagerClientError>
  updateSecret(input: {
    readonly name: string
    readonly labels: Readonly<Record<string, string>>
    readonly etag?: string
  }): Effect.Effect<SecretMetadata, SecretManagerClientError>
  deleteSecret(name: string, etag?: string): Effect.Effect<void, SecretManagerClientError>
  getIamPolicy(name: string): Effect.Effect<IamPolicy, SecretManagerClientError>
  setIamPolicy(name: string, policy: IamPolicy): Effect.Effect<void, SecretManagerClientError>
}

interface SecretProps {
  readonly project: string
  readonly secretId: string
  readonly labels?: Readonly<Record<string, string>>
  readonly deletionProtection?: boolean
}
export type SecretAttributes = SecretMetadata & { readonly deletionProtection: boolean }
export type Secret = Resource<"Proxus.GCP.SecretManager.Secret", SecretProps, SecretAttributes>
export const Secret = Resource<Secret>("Proxus.GCP.SecretManager.Secret")

interface SecretIamMemberProps extends DependsOn {
  readonly secret: string
  readonly role: string
  readonly member: string
}
type SecretIamMemberAttributes = SecretIamMemberProps
export type SecretIamMember = Resource<
  "Proxus.GCP.SecretManager.SecretIamMember",
  SecretIamMemberProps,
  SecretIamMemberAttributes
>
export const SecretIamMember = Resource<SecretIamMember>("Proxus.GCP.SecretManager.SecretIamMember")

const nameOf = (project: string, secretId: string) => `projects/${project}/secrets/${secretId}`
const isMissing = (e: SecretManagerClientError) => e.code === "not-found"
const observe = (client: SecretManagerClient, name: string) =>
  client.getSecret(name).pipe(Effect.catchIf(isMissing, () => Effect.succeed(undefined)))
const sameLabels = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())
const attrs = (secret: SecretMetadata, deletionProtection = true): SecretAttributes => ({ ...secret, labels: { ...secret.labels }, deletionProtection })

export const makeSecretProviderService = (client: SecretManagerClient) =>
  Secret.Provider.of({
    nuke: { skip: true },
    stables: ["name", "project", "secretId"],
    list: () => client.listSecrets().pipe(Effect.map((items) => items.map((item) => attrs(item)))),
    diff: ({ news, olds, output }) => {
      if (!isResolved(news)) return Effect.void
      return Effect.succeed(
        olds.project !== news.project ||
          olds.secretId !== news.secretId
          ? ({ action: "replace" } as const)
          : undefined,
      )
    },
    read: ({ fqn, output, olds }) => {
      const project = output?.project ?? olds.project
      const secretId = output?.secretId ?? olds.secretId
      if (!project || !secretId) return Effect.succeed(undefined)
      return observe(client, nameOf(project, secretId)).pipe(
        Effect.map((found) => {
          if (!found) return undefined
          const result = attrs(found, output?.deletionProtection ?? olds.deletionProtection ?? true)
          return found.labels.proxus_alchemy_fqn === ownerLabelValue(fqn) ? result : Unowned(result)
        }),
      )
    },
    reconcile: ({ fqn, news }) =>
      Effect.gen(function* () {
        const name = nameOf(news.project, news.secretId)
        const desiredLabels = { ...(news.labels ?? {}), ...ownerLabel(fqn) }
        let current = yield* observe(client, name)
        if (!current) {
          current = yield* client.createSecret({ project: news.project, secretId: news.secretId, labels: desiredLabels }).pipe(
            Effect.catchIf((e) => e.code === "conflict", () => client.getSecret(name)),
          )
        }
        if (!sameLabels(current.labels, desiredLabels)) current = yield* client.updateSecret({ name, labels: desiredLabels, ...(current.etag === undefined ? {} : { etag: current.etag }) })
        return attrs(current, news.deletionProtection ?? true)
      }),
    delete: ({ output }) => output.deletionProtection
      ? Effect.fail(new SecretManagerClientError({ operation: "delete-protected-secret", code: "forbidden" }))
      : client.deleteSecret(output.name, output.etag).pipe(Effect.catchIf((e) => e.code === "not-found", () => Effect.void)),
  })

const hasMember = (policy: IamPolicy, role: string, member: string) =>
  policy.bindings.some((b) => b.role === role && b.condition === undefined && b.members.includes(member))

export const makeSecretIamMemberProviderService = (client: SecretManagerClient) =>
  SecretIamMember.Provider.of({
    stables: ["secret", "role", "member"],
    list: () => Effect.succeed([]),
    diff: ({ news, olds, output }) => {
      if (!isResolved(news)) return Effect.void
      return Effect.succeed(
        (["secret", "role", "member"] as const).some((key) => (output?.[key] ?? olds[key]) !== news[key])
          ? ({ action: "replace" } as const)
          : undefined,
      )
    },
    read: ({ output, olds }) => {
      const value = { secret: output?.secret ?? olds.secret, role: output?.role ?? olds.role, member: output?.member ?? olds.member }
      if (!value.secret || !value.role || !value.member) return Effect.succeed(undefined)
      return client.getIamPolicy(value.secret).pipe(
        Effect.map((policy) => (hasMember(policy, value.role, value.member) ? value as SecretIamMemberAttributes : undefined)),
        Effect.catchIf(isMissing, () => Effect.succeed(undefined)),
      )
    },
    reconcile: ({ news }) =>
      Effect.gen(function* () {
        yield* mutateIamPolicy({ resource: `secret:${news.secret}`, read: () => client.getIamPolicy(news.secret), change: (policy) => {
          if (hasMember(policy, news.role, news.member)) return undefined
          const bindings = policy.bindings.map((b) => ({ ...b, members: [...b.members] }))
          const binding = bindings.find((b) => b.role === news.role && b.condition === undefined)
          if (binding) binding.members = [...binding.members, news.member]
          else bindings.push({ role: news.role, members: [news.member] })
          return { ...policy, version: Math.max(policy.version ?? 0, 3), bindings }
        }, write: (policy) => client.setIamPolicy(news.secret, policy) })
        return { secret: news.secret, role: news.role, member: news.member }
      }),
    delete: ({ output }) =>
      mutateIamPolicy({ resource: `secret:${output.secret}`, read: () => client.getIamPolicy(output.secret), change: (policy) => {
        if (!hasMember(policy, output.role, output.member)) return undefined
        return { ...policy, bindings: policy.bindings.map((b) => b.role === output.role && b.condition === undefined
          ? { ...b, members: b.members.filter((m) => m !== output.member) }
          : { ...b, members: [...b.members] }).filter((b) => b.members.length > 0) }
      }, write: (policy) => client.setIamPolicy(output.secret, policy) }).pipe(
        Effect.catchIf((e) => e.code === "not-found", () => Effect.void),
      ),
  })

export const SecretProvider = (client: SecretManagerClient) => Provider.succeed(Secret, makeSecretProviderService(client))
export const SecretIamMemberProvider = (client: SecretManagerClient) =>
  Provider.succeed(SecretIamMember, makeSecretIamMemberProviderService(client))
