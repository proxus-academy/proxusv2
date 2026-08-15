#!/usr/bin/env node
// Executable platform boundary: Node process/env/stdio are isolated here and injected into the tested orchestrator.
// @effect-diagnostics nodeBuiltinImport:off processEnv:off strictBooleanExpressions:off newPromise:off asyncFunction:off globalConsole:off
import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { CliUsageError, listPreviewStages, normalizeAlchemyArgv, parseAlchemyCli, runAlchemyCli, type ProcessRunner } from "./cli-wrapper.ts"
import { makeLeaseLock } from "./state/lease-lock.ts"
import { isEmptyStageDocument, readDocument } from "./state/gcs-state.ts"
import { makePreviewPlatformStateBackend } from "./state/preview-platform-live.ts"

const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (value === undefined || value.length === 0) throw new CliUsageError(`${name} is required`)
  return value
}

const processRunner: ProcessRunner = {
  start: (command, args, options) => {
    const child = spawn(command, [...args], { ...options, stdio: "inherit" })
    return {
      completed: new Promise((resolveChild, reject) => {
        child.once("error", reject)
        child.once("exit", (code, signal) => resolveChild({ code, signal }))
      }),
      terminate: (signal) => { child.kill(signal) },
    }
  },
}

const main = async () => {
  // Validate the complete operation before constructing ADC-backed clients.
  const argv = normalizeAlchemyArgv(process.argv.slice(2))
  const listing = argv.length === 1 && argv[0] === "list-preview-stages"
  const parsed = listing ? undefined : parseAlchemyCli(argv)
  if (!listing && parsed?.target.state === "local") {
    await runAlchemyCli(parsed, { processRunner, cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../.."), env: process.env })
    return
  }
  const project = required("GCP_PROJECT_ID")
  const backend = makePreviewPlatformStateBackend({
    project,
    bucket: required("ALCHEMY_STATE_BUCKET"),
    keyName: required("ALCHEMY_STATE_KMS_KEY"),
  })
  if (listing) {
    const prefix = "alchemy-state/v2/preview/"
    await listPreviewStages({ list: () => Effect.runPromise(backend.gcs.list(prefix).pipe(
      Effect.flatMap((objects) => Effect.all(objects.map((object) => readDocument(backend.gcs, backend.kms, object).pipe(
        Effect.map((stored) => stored !== undefined && !isEmptyStageDocument(stored.document)
          ? decodeURIComponent(object.slice(prefix.length))
          : undefined),
      )), { concurrency: 8 })),
      Effect.map((stages) => stages.filter((stage): stage is string => stage !== undefined)),
    )) }, (line) => process.stdout.write(line))
    return
  }
  if (parsed === undefined) throw new CliUsageError("invalid operation")
  const coordinator = makeLeaseLock(backend)
  const lock = {
    acquire: (request: Parameters<typeof coordinator.acquire>[0]) => Effect.runPromise(coordinator.acquire(request)),
    renew: (request: Parameters<typeof coordinator.renew>[0]) => Effect.runPromise(coordinator.renew(request)),
    release: (request: Parameters<typeof coordinator.release>[0]) => Effect.runPromise(coordinator.release(request)),
  }
  await runAlchemyCli(parsed, { processRunner, lock, cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../.."), env: process.env })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = error instanceof CliUsageError ? 2 : 1
})
