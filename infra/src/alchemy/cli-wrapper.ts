// Imperative process boundary; async/timers/native errors are intentionally injectable and kept outside stack logic.
// @effect-diagnostics asyncFunction:off newPromise:off globalTimers:off extendsNativeError:off processEnv:off
import { randomUUID } from "node:crypto"
import type { Lease } from "./state/lease-lock.ts"

export type AlchemyOperation = "plan" | "deploy" | "outputs" | "destroy"
export interface PreviewStageLister { readonly list: () => Promise<ReadonlyArray<string>> }
export interface CliTarget { readonly stack: "bootstrap" | "foundation" | "production" | "preview-platform" | "preview"; readonly stage: string; readonly main: string; readonly state: "local" | "leased"; readonly prNumber?: number; readonly adopt?: true; readonly adoptExisting?: boolean }
export interface ChildResult { readonly code: number | null; readonly signal?: NodeJS.Signals | null }
export interface RunningChild { readonly completed: Promise<ChildResult>; readonly terminate: (signal: NodeJS.Signals) => void }
export interface ProcessRunner { readonly start: (command: string, args: ReadonlyArray<string>, options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv }) => RunningChild }
interface LockRunner {
  readonly acquire: (request: { stack: string; stage: string; owner: string; leaseId: string; ttlMs: number }) => Promise<Lease>
  readonly renew: (request: { stack: string; stage: string; lease: Lease; ttlMs: number }) => Promise<Lease>
  readonly release: (request: { stack: string; stage: string; lease: Lease }) => Promise<void>
}
export interface WrapperDependencies {
  readonly processRunner: ProcessRunner
  readonly lock?: LockRunner
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly owner?: string
  readonly newLeaseId?: () => string
  readonly ttlMs?: number
  readonly renewalMs?: number
  readonly sleep?: (milliseconds: number) => Promise<void>
}

export class CliUsageError extends Error {}
export class LeaseLostError extends Error {}

/** Lists only canonical preview stages; output is injected to keep this cloud/stdio boundary testable. */
export const listPreviewStages = async (lister: PreviewStageLister, write: (line: string) => void): Promise<void> => {
  const stages = [...new Set(await lister.list())].filter((stage) => /^pr-[1-9][0-9]{0,5}$/.test(stage)).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
  write(`${JSON.stringify(stages)}\n`)
}

export const normalizeAlchemyArgv = (argv: ReadonlyArray<string>): ReadonlyArray<string> => argv[0] === "--" ? argv.slice(1) : argv

export const parseAlchemyCli = (argv: ReadonlyArray<string>): { operation: AlchemyOperation; target: CliTarget } => {
  const [operation, ...args] = normalizeAlchemyArgv(argv)
  if (!(["plan", "deploy", "outputs", "destroy"] as const).includes(operation as AlchemyOperation)) throw new CliUsageError("operation must be plan, deploy, outputs or destroy")
  const value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1] }
  const stage = value("--stage")
  const pr = value("--pr")
  if ((stage === undefined) === (pr === undefined)) throw new CliUsageError("specify exactly one of --stage bootstrap|foundation|production|preview-platform or --pr NUMBER")
  if (stage !== undefined) {
    if (!(new Set(["bootstrap", "foundation", "production", "preview-platform"])).has(stage)) throw new CliUsageError("--stage must be bootstrap, foundation, production or preview-platform")
    if (operation === "destroy") throw new CliUsageError("destroy is only permitted for pr-N previews")
    const adoption = value("--adopt-existing")
    if (stage === "foundation") {
      if (adoption !== "true" && adoption !== "false") throw new CliUsageError("foundation requires --adopt-existing true|false")
      if (args.length !== 4) throw new CliUsageError("foundation accepts only --stage and --adopt-existing")
      return { operation: operation as AlchemyOperation, target: { stack: "foundation", stage: "foundation", main: "alchemy.foundation.ts", state: "leased", adoptExisting: adoption === "true" } }
    }
    if (stage === "bootstrap") {
      const adopt = args.includes("--adopt")
      if ((adopt && (operation !== "deploy" || args.length !== 3)) || (!adopt && args.length !== 2) || adoption !== undefined) throw new CliUsageError("bootstrap accepts optional --adopt only for deploy")
      return { operation: operation as AlchemyOperation, target: { stack: "bootstrap", stage: "bootstrap", main: "alchemy.bootstrap.ts", state: "local", ...(adopt ? { adopt: true as const } : {}) } }
    }
    if (adoption !== undefined || args.length !== 2) throw new CliUsageError("this stage accepts only --stage")
    return stage === "production"
      ? { operation: operation as AlchemyOperation, target: { stack: "production", stage: "production", main: "alchemy.production.ts", state: "leased" } }
      : { operation: operation as AlchemyOperation, target: { stack: "preview-platform", stage: "production", main: "alchemy.preview-platform.ts", state: "leased" } }
  }
  if (args.length !== 2) throw new CliUsageError("preview accepts only --pr")
  if (pr === undefined || !/^[1-9][0-9]{0,5}$/.test(pr)) throw new CliUsageError("--pr must be an integer between 1 and 999999")
  return { operation: operation as AlchemyOperation, target: { stack: "preview", stage: `pr-${pr}`, main: "alchemy.preview.ts", state: "leased", prNumber: Number(pr) } }
}

const leaseEnv = (lease: Lease): NodeJS.ProcessEnv => ({
  ALCHEMY_STACK_NAME: lease.stack, ALCHEMY_STAGE: lease.stage, ALCHEMY_LEASE_OWNER: lease.owner,
  ALCHEMY_LEASE_ID: lease.leaseId, ALCHEMY_LEASE_GENERATION: lease.generation,
  ALCHEMY_LEASE_EXPIRES_AT: String(lease.expiresAt),
})
const commandArgs = (operation: AlchemyOperation, target: CliTarget): ReadonlyArray<string> => operation === "outputs"
  // beta.65 has no `outputs` command. Stack outputs use this reserved FQN;
  // `state get` imports the state layer but never plans or reconciles resources.
  ? ["state", "get", target.main, "--stack", target.stack, "--stage", target.stage, "--fqn", "__stack_output__", ...(target.state === "local" ? ["--local"] : [])]
  : [operation, target.main, "--stage", target.stage, ...(operation === "deploy" || operation === "destroy" ? ["--yes"] : []), ...(target.adopt === true ? ["--adopt"] : [])]

/** Runs local bootstrap directly; every other stack runs under a renewable, fenced lease. */
export const runAlchemyCli = async (parsed: ReturnType<typeof parseAlchemyCli>, dependencies: WrapperDependencies): Promise<void> => {
  const childEnv = { ...dependencies.env, ALCHEMY_STACK_NAME: parsed.target.stack, ALCHEMY_STAGE: parsed.target.stage,
    ...(parsed.target.adoptExisting === undefined ? {} : { ALCHEMY_ADOPT_EXISTING: String(parsed.target.adoptExisting) }),
    ...(parsed.target.prNumber === undefined ? {} : { PR_NUMBER: String(parsed.target.prNumber) }) }
  if (parsed.target.state === "local") {
    const result = await dependencies.processRunner.start("alchemy", commandArgs(parsed.operation, parsed.target), { cwd: dependencies.cwd, env: childEnv }).completed
    if (result.code !== 0) throw new Error(`Alchemy exited with ${result.code ?? result.signal ?? "unknown status"}`)
    return
  }
  if (dependencies.lock === undefined) throw new CliUsageError("a remote lease is required for this stage")
  const lock = dependencies.lock
  const ttlMs = dependencies.ttlMs ?? 60_000
  const renewalMs = dependencies.renewalMs ?? 20_000
  if (!(ttlMs > 0 && renewalMs > 0 && renewalMs < ttlMs)) throw new CliUsageError("lease timings are invalid")
  const owner = dependencies.owner ?? `${process.env.GITHUB_RUN_ID ?? "local"}:${process.pid}`
  const leaseId = (dependencies.newLeaseId ?? randomUUID)()
  let lease = await lock.acquire({ ...parsed.target, owner, leaseId, ttlMs })
  const child = dependencies.processRunner.start("alchemy", commandArgs(parsed.operation, parsed.target), {
    cwd: dependencies.cwd,
    env: { ...childEnv, ...leaseEnv(lease) },
  })
  let stopped = false
  let leaseFailure: unknown
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  let wakeStop: (() => void) | undefined
  const stopSignal = new Promise<void>((resolve) => { wakeStop = resolve })
  const renew = (async () => {
    while (!stopped) {
      await Promise.race([sleep(renewalMs), stopSignal])
      if (stopped) return
      try { lease = await lock.renew({ stack: parsed.target.stack, stage: parsed.target.stage, lease, ttlMs }) }
      catch (error) { leaseFailure = error; child.terminate("SIGTERM"); return }
    }
  })()
  let result: ChildResult
  try { result = await child.completed } finally { stopped = true; wakeStop?.(); await renew }
  let releaseFailure: unknown
  try { await lock.release({ stack: parsed.target.stack, stage: parsed.target.stage, lease }) } catch (error) { releaseFailure = error }
  if (leaseFailure !== undefined) throw new LeaseLostError(`Alchemy terminated after losing its lease: ${String(leaseFailure)}`)
  if (releaseFailure !== undefined) throw new LeaseLostError(`Alchemy completed but fenced lease release failed: ${String(releaseFailure)}`)
  if (result.code !== 0) throw new Error(`Alchemy exited with ${result.code ?? result.signal ?? "unknown status"}`)
}
