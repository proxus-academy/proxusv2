// Promise-based fakes exercise the imperative child-process boundary without cloud access.
// @effect-diagnostics newPromise:off asyncFunction:off
import { describe, expect, it, vi } from "vitest"
import { CliUsageError, LeaseLostError, listPreviewStages, parseAlchemyCli, runAlchemyCli, type ChildResult, type RunningChild } from "./cli-wrapper.ts"
import type { Lease } from "./state/lease-lock.ts"

const lease: Lease = { stack: "preview", stage: "pr-42", owner: "test", leaseId: "id", generation: "7", expiresAt: 999999 }
const deferredChild = () => {
  let finish!: (result: ChildResult) => void
  const terminate = vi.fn()
  const child: RunningChild = { completed: new Promise((resolve) => { finish = resolve }), terminate }
  return { child, finish, terminate }
}

describe("Alchemy CLI target validation", () => {
  it("keeps preview-platform and matching pr-N targets, tolerating pnpm's one leading separator", () => {
    expect(parseAlchemyCli(["plan", "--stage", "preview-platform"]).target).toMatchObject({ stack: "preview-platform", stage: "production" })
    expect(parseAlchemyCli(["--", "deploy", "--pr", "42"]).target).toMatchObject({ stack: "preview", stage: "pr-42", prNumber: 42 })
    for (const argv of [["destroy", "--stage", "preview-platform"], ["plan", "--pr", "0"], ["plan", "--stage", "unknown"], ["plan", "--pr", "4", "--extra"], ["--", "--", "plan", "--pr", "4"]]) {
      expect(() => parseAlchemyCli(argv)).toThrow(CliUsageError)
    }
  })

  it("selects bootstrap locally, never permits destroy, and does not accept adoption policy", () => {
    expect(parseAlchemyCli(["plan", "--stage", "bootstrap"]).target).toEqual({ stack: "bootstrap", stage: "bootstrap", main: "alchemy.bootstrap.ts", state: "local" })
    expect(parseAlchemyCli(["deploy", "--stage", "bootstrap"]).operation).toBe("deploy")
    expect(parseAlchemyCli(["deploy", "--stage", "bootstrap", "--adopt"]).target.adopt).toBe(true)
    expect(parseAlchemyCli(["outputs", "--stage", "bootstrap"]).operation).toBe("outputs")
    expect(() => parseAlchemyCli(["destroy", "--stage", "bootstrap"])).toThrow(CliUsageError)
    expect(() => parseAlchemyCli(["plan", "--stage", "bootstrap", "--adopt-existing", "true"])).toThrow(CliUsageError)
    expect(() => parseAlchemyCli(["plan", "--stage", "bootstrap", "--adopt"])).toThrow(CliUsageError)
  })

  it("requires an explicit foundation adoption policy and never permits destroy", () => {
    expect(parseAlchemyCli(["plan", "--stage", "foundation", "--adopt-existing", "false"]).target).toMatchObject({ stack: "foundation", main: "alchemy.foundation.ts", state: "leased", adoptExisting: false })
    expect(parseAlchemyCli(["deploy", "--stage", "foundation", "--adopt-existing", "true"]).target.adoptExisting).toBe(true)
    expect(parseAlchemyCli(["outputs", "--stage", "foundation", "--adopt-existing", "false"]).operation).toBe("outputs")
    for (const argv of [["plan", "--stage", "foundation"], ["plan", "--stage", "foundation", "--adopt-existing", "yes"], ["destroy", "--stage", "foundation", "--adopt-existing", "false"]]) expect(() => parseAlchemyCli(argv)).toThrow(CliUsageError)
  })

  it("permits only plan, deploy and outputs for the production entrypoint", () => {
    expect(parseAlchemyCli(["plan", "--stage", "production"])).toMatchObject({ operation: "plan", target: { stack: "production", stage: "production", main: "alchemy.production.ts" } })
    expect(parseAlchemyCli(["deploy", "--stage", "production"]).operation).toBe("deploy")
    expect(parseAlchemyCli(["outputs", "--stage", "production"]).operation).toBe("outputs")
    expect(() => parseAlchemyCli(["destroy", "--stage", "production"])).toThrow(CliUsageError)
  })
})

describe("Alchemy preview stage listing", () => {
  it("emits sorted unique canonical stages through injected ports", async () => {
    const write = vi.fn()
    await listPreviewStages({ list: vi.fn(async () => ["pr-20", "production", "pr-2", "pr-02", "pr-2", "pr-1000000"]) }, write)
    expect(write).toHaveBeenCalledWith('["pr-2","pr-20"]\n')
  })
})

describe("Alchemy CLI orchestration", () => {
  it("runs bootstrap with local state and no remote lease or backend env", async () => {
    const start = vi.fn((): RunningChild => ({ completed: Promise.resolve({ code: 0 }), terminate: vi.fn() }))
    await runAlchemyCli(parseAlchemyCli(["outputs", "--stage", "bootstrap"]), { processRunner: { start }, cwd: "/infra", env: { GCP_PROJECT_ID: "p" } })
    expect(start).toHaveBeenCalledWith("alchemy", ["state", "get", "alchemy.bootstrap.ts", "--stack", "bootstrap", "--stage", "bootstrap", "--fqn", "__stack_output__", "--local"], { cwd: "/infra", env: { GCP_PROJECT_ID: "p", ALCHEMY_STACK_NAME: "bootstrap", ALCHEMY_STAGE: "bootstrap" } })
  })

  it("injects the explicit foundation adoption policy under its GCS/KMS lease", async () => {
    const foundationLease: Lease = { ...lease, stack: "foundation", stage: "foundation" }
    const start = vi.fn((): RunningChild => ({ completed: Promise.resolve({ code: 0 }), terminate: vi.fn() }))
    const lock = { acquire: vi.fn(async () => foundationLease), renew: vi.fn(), release: vi.fn(async () => undefined) }
    await runAlchemyCli(parseAlchemyCli(["plan", "--stage", "foundation", "--adopt-existing", "false"]), { processRunner: { start }, lock, cwd: "/infra", env: {}, sleep: () => new Promise(() => undefined) })
    expect(start).toHaveBeenCalledWith("alchemy", ["plan", "alchemy.foundation.ts", "--stage", "foundation"], expect.objectContaining({ env: expect.objectContaining({ ALCHEMY_ADOPT_EXISTING: "false", ALCHEMY_LEASE_GENERATION: "7" }) }))
  })
  it("passes the exact fence to Alchemy and releases after success without cloud", async () => {
    const running = deferredChild()
    let invocation: [string, ReadonlyArray<string>, { cwd: string; env: NodeJS.ProcessEnv }] | undefined
    const dependenciesStart = (command: string, args: ReadonlyArray<string>, options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      invocation = [command, args, options]
      return running.child
    }
    const start = vi.fn(dependenciesStart)
    const lock = { acquire: vi.fn(async () => ({ ...lease })), renew: vi.fn(), release: vi.fn(async () => undefined) }
    const execution = runAlchemyCli(parseAlchemyCli(["deploy", "--pr", "42"]), {
      processRunner: { start }, lock, cwd: "/infra", env: { DEPLOY_SERVICES: "false" }, owner: "test", newLeaseId: () => "id",
      sleep: () => new Promise(() => undefined),
    })
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(invocation).toBeDefined()
    const [, args, options] = invocation!
    expect(args).toEqual(["deploy", "alchemy.preview.ts", "--stage", "pr-42", "--yes"])
    expect(options.env).toMatchObject({ ALCHEMY_STACK_NAME: "preview", ALCHEMY_STAGE: "pr-42", ALCHEMY_LEASE_GENERATION: "7", ALCHEMY_LEASE_EXPIRES_AT: "999999", PR_NUMBER: "42" })
    running.finish({ code: 0 })
    await execution
    expect(lock.release).toHaveBeenCalledWith(expect.objectContaining({ stack: "preview", stage: "pr-42" }))
  })

  it("runs production outputs under the external fence", async () => {
    const productionLease: Lease = { ...lease, stack: "production", stage: "production" }
    const start = vi.fn((): RunningChild => ({ completed: Promise.resolve({ code: 0 }), terminate: vi.fn() }))
    const lock = { acquire: vi.fn(async () => productionLease), renew: vi.fn(), release: vi.fn(async () => undefined) }
    await runAlchemyCli(parseAlchemyCli(["outputs", "--stage", "production"]), {
      processRunner: { start }, lock, cwd: "/infra", env: {}, owner: "test", newLeaseId: () => "id",
      sleep: () => new Promise(() => undefined),
    })
    expect(start).toHaveBeenCalledWith("alchemy", ["state", "get", "alchemy.production.ts", "--stack", "production", "--stage", "production", "--fqn", "__stack_output__"], expect.objectContaining({ env: expect.objectContaining({ ALCHEMY_LEASE_GENERATION: "7" }) }))
    expect(lock.release).toHaveBeenCalledWith(expect.objectContaining({ stack: "production", stage: "production" }))
  })

  it.each([
    [["outputs", "--stage", "foundation", "--adopt-existing", "false"], "alchemy.foundation.ts", "foundation", "foundation"],
    [["outputs", "--stage", "preview-platform"], "alchemy.preview-platform.ts", "preview-platform", "production"],
    [["outputs", "--pr", "42"], "alchemy.preview.ts", "preview", "pr-42"],
  ] as const)("passes exact remote output argv for %j", async (wrapperArgv, main, stack, stage) => {
    const targetLease: Lease = { ...lease, stack, stage }
    const start = vi.fn((_command: string, _args: ReadonlyArray<string>, _options: { cwd: string; env: NodeJS.ProcessEnv }): RunningChild => ({ completed: Promise.resolve({ code: 0 }), terminate: vi.fn() }))
    const lock = { acquire: vi.fn(async () => targetLease), renew: vi.fn(), release: vi.fn(async () => undefined) }
    await runAlchemyCli(parseAlchemyCli(wrapperArgv), { processRunner: { start }, lock, cwd: "/infra", env: {}, sleep: () => new Promise(() => undefined) })
    expect(start.mock.calls[0]?.[1]).toEqual(["state", "get", main, "--stack", stack, "--stage", stage, "--fqn", "__stack_output__"])
  })

  it("terminates the production child and fails closed when renewal loses the fence", async () => {
    const running = deferredChild()
    const productionLease: Lease = { ...lease, stack: "production", stage: "production" }
    let invocation: ReadonlyArray<string> | undefined
    const lock = { acquire: vi.fn(async () => productionLease), renew: vi.fn(async () => { throw new Error("fenced") }), release: vi.fn(async () => undefined) }
    const execution = runAlchemyCli(parseAlchemyCli(["plan", "--stage", "production"]), {
      processRunner: { start: (_command, args) => { invocation = args; return running.child } }, lock, cwd: "/infra", env: {}, owner: "test", newLeaseId: () => "id", renewalMs: 1, ttlMs: 10,
      sleep: async () => undefined,
    })
    await vi.waitFor(() => expect(running.terminate).toHaveBeenCalledWith("SIGTERM"))
    expect(invocation).toEqual(["plan", "alchemy.production.ts", "--stage", "production"])
    running.finish({ code: null, signal: "SIGTERM" })
    await expect(execution).rejects.toBeInstanceOf(LeaseLostError)
    expect(lock.release).toHaveBeenCalledWith(expect.objectContaining({ stack: "production", stage: "production" }))
  })
})
