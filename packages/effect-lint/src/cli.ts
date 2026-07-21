#!/usr/bin/env node
import ts from "typescript"
import { checkWorkspace } from "./check.js"

const root = process.argv[2] ?? ts.sys.getCurrentDirectory()
const diagnostics = checkWorkspace(root)

for (const item of diagnostics) {
  process.stderr.write(
    `${item.file}:${item.line}:${item.column} ${item.ruleId}: ${item.message}\n` +
    `  Found: ${item.moduleName}\n` +
    `  Use: ${item.alternatives.join(", ")}\n`,
  )
}

if (diagnostics.length > 0) {
  process.stderr.write(`\n${diagnostics.length} Effect platform replacement violation(s).\n`)
  process.exitCode = 1
} else {
  process.stdout.write("0 Effect platform replacement violations.\n")
}
