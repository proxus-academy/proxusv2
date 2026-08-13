#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const [operation, ...args] = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
const environment = valueAfter("--environment")
const pr = valueAfter("--pr")

if (!new Set(["preview", "deploy", "destroy", "outputs"]).has(operation)) {
  console.error("Usage: pnpm infra <preview|deploy|destroy|outputs> (--environment foundation|production | --pr NUMBER)")
  process.exit(2)
}
if ((environment === undefined) === (pr === undefined)) {
  console.error("Specify exactly one of --environment or --pr.")
  process.exit(2)
}
if (environment !== undefined && !new Set(["foundation", "production"]).has(environment)) {
  console.error("--environment must be foundation or production.")
  process.exit(2)
}
if (pr !== undefined && !/^[1-9][0-9]{0,5}$/.test(pr)) {
  console.error("--pr must be an integer between 1 and 999999.")
  process.exit(2)
}
if (operation === "destroy" && pr === undefined) {
  console.error("The wrapper only permits destroy for a PR preview stack.")
  process.exit(2)
}

const project = pr === undefined ? environment : "preview"
const stack = pr === undefined ? environment : `pr-${pr}`
const cwd = resolve(root, project)
const run = (commandArgs, allowFailure = false) => {
  const result = spawnSync("pulumi", commandArgs, { cwd, stdio: "inherit" })
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1)
  return result.status === 0
}

run(["login", process.env.PULUMI_BACKEND_URL ?? "gs://proxus-v2-pulumi-state"])
if (!run(["stack", "select", stack], true)) {
  const secretsProvider = process.env.PULUMI_SECRETS_PROVIDER
  if (secretsProvider === undefined || secretsProvider.length === 0) {
    console.error("Set PULUMI_SECRETS_PROVIDER to initialize a missing stack without a passphrase secret.")
    process.exit(2)
  }
  run(["stack", "init", stack, "--secrets-provider", secretsProvider])
}

if (operation === "preview") run(["preview", "--diff"])
if (operation === "deploy") run(["up", "--yes", "--diff"])
if (operation === "outputs") run(["stack", "output", "--json"])
if (operation === "destroy") {
  run(["destroy", "--yes", "--diff"])
  run(["stack", "rm", stack, "--yes"])
}
