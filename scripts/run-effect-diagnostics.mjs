#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const readFlag = (name) => {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    console.error(`${name} requires a value.`)
    process.exit(1)
  }
  return value
}

const root = resolve(readFlag("--root") ?? scriptRoot)
const inventoryFlag = readFlag("--inventory")
const knownArguments = new Set(["--root", "--inventory"])
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index]
  if (!knownArguments.has(argument)) {
    console.error(`Unknown argument: ${argument}`)
    process.exit(1)
  }
  index += 1
}

const run = (command, args, options) => spawnSync(command, args, {
  ...options,
  shell: process.platform === "win32" && /[.](?:cmd|bat)$/i.test(command)
})

const readInventory = () => {
  if (inventoryFlag !== undefined) {
    const inventoryPath = resolve(root, inventoryFlag)
    try {
      return JSON.parse(readFileSync(inventoryPath, "utf8"))
    } catch (error) {
      console.error(`Could not read Effect diagnostics inventory ${inventoryPath}: ${error.message}`)
      process.exit(1)
    }
  }

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  const result = run(
    pnpm,
    ["list", "--recursive", "--depth", "-1", "--json"],
    { cwd: root, encoding: "utf8" }
  )
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? result.error?.message ?? "pnpm workspace inventory failed.\n")
    process.exit(result.status ?? 1)
  }

  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    console.error(`Could not parse pnpm's workspace inventory: ${error.message}`)
    process.exit(1)
  }
}

const inventory = readInventory()
if (!Array.isArray(inventory)) {
  console.error("Effect diagnostics inventory must be a JSON array.")
  process.exit(1)
}

const workspacePaths = inventory.map((workspace, index) => {
  const path = typeof workspace === "string" ? workspace : workspace?.path
  if (typeof path !== "string" || path.length === 0) {
    console.error(`Effect diagnostics inventory entry ${index} has no path.`)
    process.exit(1)
  }
  return isAbsolute(path) ? path : resolve(root, path)
})

const projects = workspacePaths
  .map((workspacePath) => resolve(workspacePath, "tsconfig.json"))
  .filter(existsSync)
  .sort((left, right) => left.localeCompare(right))

if (projects.length === 0) {
  console.error("No workspace tsconfig.json files were discovered.")
  process.exit(1)
}

console.log(`Effect diagnostics: ${projects.length} workspace TypeScript projects`)
for (const project of projects) console.log(`- ${relative(root, project)}`)

const executable = resolve(root, "node_modules/.bin", `effect-language-service${process.platform === "win32" ? ".cmd" : ""}`)
if (!existsSync(executable)) {
  console.error(`Effect Language Service executable not found at ${executable}.`)
  process.exit(1)
}

const format = process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "text"
let baseConfig
try {
  baseConfig = JSON.parse(readFileSync(resolve(root, "tsconfig.base.json"), "utf8"))
} catch (error) {
  console.error(`Could not read tsconfig.base.json: ${error.message}`)
  process.exit(1)
}
const effectPlugin = baseConfig.compilerOptions?.plugins?.find(
  (plugin) => plugin.name === "@effect/language-service"
)
if (!effectPlugin) {
  console.error("tsconfig.base.json does not configure @effect/language-service.")
  process.exit(1)
}
const { name: _pluginName, ...languageServiceConfig } = effectPlugin
const failed = []

for (const project of projects) {
  console.log(`\n[effect] ${relative(root, project)}`)
  const result = run(
    executable,
    [
      "diagnostics",
      "--project",
      project,
      "--strict",
      "--format",
      format,
      "--lspconfig",
      JSON.stringify(languageServiceConfig)
    ],
    { cwd: root, stdio: "inherit" }
  )

  if (result.status !== 0) failed.push(relative(root, project))
}

if (failed.length > 0) {
  console.error(`\nEffect diagnostics failed in ${failed.length} project(s):`)
  for (const project of failed) console.error(`- ${project}`)
  process.exit(1)
}
