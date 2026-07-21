// @effect-diagnostics nodeBuiltinImport:off globalErrorInEffectCatch:off globalErrorInEffectFailure:off asyncFunction:off strictBooleanExpressions:off
import { execFile } from "node:child_process"
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { makeSandboxId } from "@proxus/agent-harness/ids"
import { SandboxProvider, type SandboxHandle } from "@proxus/agent-harness/sandbox"
import { Effect, Layer } from "effect"

const safePath = (root: string, input: string) => Effect.tryPromise({
  try: async () => {
    if (isAbsolute(input)) throw new Error("Absolute sandbox paths are forbidden")
    const target = resolve(root, input)
    const rel = relative(root, target)
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Path escapes sandbox workspace")
    let current = root
    for (const part of rel.split(sep).slice(0, -1)) {
      current = resolve(current, part)
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error("Symbol links are forbidden") } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    }
    return target
  },
  catch: (error) => error as Error,
})

const run = (workspace: string, request: { readonly command: string; readonly args?: ReadonlyArray<string>; readonly timeoutMs?: number }) => Effect.callback<{ exitCode: number; stdout: string; stderr: string }, Error>((resume) => {
  const child = execFile(request.command, [...(request.args ?? [])], { cwd: workspace, timeout: request.timeoutMs ?? 30_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
    if (error && typeof (error as { code?: unknown }).code !== "number") resume(Effect.fail(new Error(`Workspace process failed: ${error.message}`)))
    else resume(Effect.succeed({ exitCode: typeof (error as { code?: unknown } | null)?.code === "number" ? (error as unknown as { code: number }).code : 0, stdout, stderr }))
  })
  return Effect.sync(() => child.kill("SIGKILL"))
})

/** Trusted CI adapter. It confines paths but is intentionally not a security boundary. */
export const currentWorkspaceSandboxLayer = (directory: string): Layer.Layer<SandboxProvider> => Layer.succeed(SandboxProvider, SandboxProvider.of({
  acquire: () => Effect.acquireRelease(
    Effect.tryPromise({ try: () => realpath(directory), catch: (error) => error as Error }),
    () => Effect.void,
  ).pipe(Effect.map((workspace): SandboxHandle => ({
    id: makeSandboxId("current/workspace"), workspace,
    readText: (path) => safePath(workspace, path).pipe(Effect.flatMap((file) => Effect.tryPromise({ try: () => readFile(file, "utf8"), catch: (error) => error as Error }))),
    writeText: (path, content) => safePath(workspace, path).pipe(Effect.flatMap((file) => Effect.tryPromise({ try: async () => { await mkdir(resolve(file, ".."), { recursive: true }); await writeFile(file, content, "utf8") }, catch: (error) => error as Error }))),
    run: (request) => run(workspace, request),
  }))),
}))
