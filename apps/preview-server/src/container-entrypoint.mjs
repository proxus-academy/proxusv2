import { spawn } from "node:child_process"

const children = [
  spawn("node", ["/app/api.mjs"], { stdio: "inherit", env: process.env }),
  spawn("node", ["/app/gateway.mjs"], { stdio: "inherit", env: process.env }),
]

let stopping = false
const stop = (signal) => {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill(signal)
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal))
for (const child of children) child.on("exit", (code, signal) => {
  if (!stopping) {
    console.error(`preview child exited unexpectedly (${signal ?? code ?? "unknown"})`)
    stop("SIGTERM")
  }
})
await Promise.all(children.map((child) => new Promise((resolve) => child.on("exit", resolve))))
process.exitCode = 1
