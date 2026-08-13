#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const [operation, ...args] = process.argv.slice(2)
const environmentIndex = args.indexOf("--environment")
const environment = environmentIndex === -1 ? undefined : args[environmentIndex + 1]

if (!new Set(["preview", "deploy", "outputs"]).has(operation) || environment !== "foundation") {
  console.error("Usage: pnpm infra <preview|deploy|outputs> --environment foundation")
  process.exit(2)
}

const cwd = resolve(root, "foundation")
const run = (commandArgs, allowFailure = false) => {
  const result = spawnSync("pulumi", commandArgs, { cwd, stdio: "inherit" })
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1)
  return result.status === 0
}

run(["login", process.env.PULUMI_BACKEND_URL ?? "gs://proxus-v2-pulumi-state"])
if (!run(["stack", "select", "foundation"], true)) {
  const secretsProvider = process.env.PULUMI_SECRETS_PROVIDER
  if (secretsProvider === undefined || secretsProvider.length === 0) {
    console.error("Set PULUMI_SECRETS_PROVIDER to initialize the foundation stack without a passphrase secret.")
    process.exit(2)
  }
  run(["stack", "init", "foundation", "--secrets-provider", secretsProvider])
}

if (operation === "preview") run(["preview", "--diff"])
if (operation === "deploy") run(["up", "--yes", "--diff"])
if (operation === "outputs") run(["stack", "output", "--json"])
