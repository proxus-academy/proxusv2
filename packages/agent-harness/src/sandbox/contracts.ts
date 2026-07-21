import { Context, Effect } from "effect"
import type { SandboxId } from "../ids.js"

/** Provider-neutral capabilities of one acquired workspace. Implementations must confine paths. */
export interface SandboxHandle {
  readonly id: SandboxId
  readonly workspace: string
  readonly readText: (path: string) => Effect.Effect<string, Error>
  readonly writeText: (path: string, content: string) => Effect.Effect<void, Error>
  readonly run: (request: { readonly command: string; readonly args?: ReadonlyArray<string>; readonly timeoutMs?: number }) => Effect.Effect<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }, Error>
}

export interface SandboxRequest {
  readonly repository?: string
  readonly toolchains?: ReadonlyArray<string>
  readonly network?: "denied" | ReadonlyArray<string>
  readonly labels?: Readonly<Record<string, string>>
}

/** Acquisition is scoped. The parent owns the scope; delegated children only borrow the handle. */
export class SandboxProvider extends Context.Service<SandboxProvider, {
  readonly acquire: (request: SandboxRequest) => Effect.Effect<SandboxHandle, Error, import("effect").Scope.Scope>
}>()("@proxus/agent-harness/sandbox/contracts/SandboxProvider") {}
