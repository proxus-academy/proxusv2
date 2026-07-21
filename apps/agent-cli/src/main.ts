// @effect-diagnostics nodeBuiltinImport:off processEnv:off globalConsole:off globalErrorInEffectCatch:off preferSchemaOverJson:off
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { runDeterministicScenario } from "./app.js"

const { values } = parseArgs({ options: { database: { type: "string", short: "d", default: ".proxus/agent-runs" }, workspace: { type: "string" }, json: { type: "boolean", default: false } } })
runDeterministicScenario({ database: resolve(values.database!), ...(values.workspace !== undefined ? { workspace: resolve(values.workspace) } : {}), write: values.json ? () => undefined : console.error }).then((report) => {
  if (values.json) console.log(JSON.stringify(report))
  else console.log(`run ${report.run.id}: ${report.run.status}\nvalidation: ${report.validation}\noutput: ${report.run.output ?? ""}`)
}, (error) => { console.error(error); process.exitCode = 1 })
