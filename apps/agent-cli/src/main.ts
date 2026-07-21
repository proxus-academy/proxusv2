// @effect-diagnostics nodeBuiltinImport:off processEnv:off globalConsole:off globalConsoleInEffect:off globalErrorInEffectCatch:off globalErrorInEffectFailure:off preferSchemaOverJson:off strictEffectProvide:off anyUnknownInErrorContext:off
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"
import { parseArgs } from "node:util"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { ConfigProvider, Effect, Option } from "effect"
import { runDeterministicScenario } from "./app.js"
import { playgroundChatTurn, playgroundRun } from "./playground.js"

const usage = `Usage:
  pnpm agent run --input "Your request" [--database .proxus/agent-runs]
  pnpm agent chat
  pnpm agent scenario [--database .proxus/agent-runs] [--workspace PATH] [--json]`

const [command = "help", ...args] = process.argv.slice(2)
const { values } = parseArgs({
  args,
  options: {
    input: { type: "string", short: "i" },
    database: { type: "string", short: "d", default: ".proxus/agent-runs" },
    workspace: { type: "string" },
    json: { type: "boolean", default: false },
  },
})

const withApplicationConfig = <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.gen(function*() {
  const dotEnv = yield* ConfigProvider.fromDotEnv({ path: resolve(import.meta.dirname, "../../../.env") }).pipe(
    Effect.catch(() => Effect.succeed(ConfigProvider.fromUnknown({}))),
  )
  const provider = ConfigProvider.fromEnv().pipe(ConfigProvider.orElse(dotEnv))
  return yield* program.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
}).pipe(Effect.provide(NodeFileSystem.layer))

const run = Effect.gen(function*() {
  if (command === "run") {
    if (values.input === undefined || values.input.trim() === "") return yield* Effect.fail(new Error("--input is required\n\n" + usage))
    const database = values.database === ":memory:" ? ":memory:" : resolve(values.database!)
    if (database !== ":memory:") mkdirSync(database, { recursive: true })
    const result = yield* playgroundRun({ database, input: values.input })
    console.log(result.output ?? `Run ${result.id} ended with status ${result.status}${result.failure === undefined ? "" : `: ${result.failure}`}`)
    return
  }

  if (command === "chat") {
    const terminal = createInterface({ input: stdin, output: stdout })
    let context: ReadonlyArray<{ readonly role: "user" | "assistant"; readonly content: string }> = []
    console.log("Gemini playground. Type /exit to finish.\n")
    try {
      while (true) {
        const answer = yield* Effect.tryPromise({
          try: () => terminal.question("you> "),
          catch: String,
        }).pipe(Effect.option)
        if (Option.isNone(answer)) break
        const input = answer.value.trim()
        if (input === "/exit" || input === "/quit") break
        if (input === "") continue
        context = [...context, { role: "user", content: input }]
        const turn = yield* playgroundChatTurn(context)
        context = turn.context
        console.log(`gemini> ${turn.answer}\n`)
      }
    } finally {
      terminal.close()
    }
    return
  }

  if (command === "scenario") {
    const report = yield* Effect.promise(() => runDeterministicScenario({
      database: resolve(values.database!),
      ...(values.workspace !== undefined ? { workspace: resolve(values.workspace) } : {}),
      write: values.json ? () => undefined : console.error,
    }))
    if (values.json) console.log(JSON.stringify(report))
    else console.log(`run ${report.run.id}: ${report.run.status}\nvalidation: ${report.validation}\noutput: ${report.run.output ?? ""}`)
    return
  }

  console.log(usage)
})

Effect.runPromise(withApplicationConfig(run)).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
