#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { isBuiltin } from "node:module"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const rootFlag = process.argv.indexOf("--root")
const root = resolve(rootFlag === -1 ? scriptRoot : process.argv[rootFlag + 1] ?? "")
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
]
const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"])
const ignoredDirectories = new Set([
  ".git",
  ".repos",
  "coverage",
  "dist",
  "node_modules",
  "storybook-static"
])
const errors = new Set()

const addError = (kind, location, message) => {
  errors.add(`[${kind}] ${location}: ${message}`)
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
const toPosix = (path) => path.split(sep).join("/")
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const wildcardRegExp = (pattern) => new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`)
const wildcardMatch = (pattern, value) => pattern.includes("*") && wildcardRegExp(pattern).test(value)

const discoverPackages = () => {
  const packageDirectories = []
  for (const parentName of ["apps", "packages"]) {
    const parent = resolve(root, parentName)
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && existsSync(resolve(parent, entry.name, "package.json"))) {
        packageDirectories.push(resolve(parent, entry.name))
      }
    }
  }
  return packageDirectories
}

const isInside = (parent, child) => {
  const path = relative(parent, child)
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
}

const exportEntries = (exportsField) => {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) return [[".", exportsField]]
  if (!exportsField || typeof exportsField !== "object") return []
  const entries = Object.entries(exportsField)
  return entries.some(([key]) => key.startsWith(".")) ? entries : [[".", exportsField]]
}

const stringTargets = (value) => {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(stringTargets)
  if (value && typeof value === "object") return Object.values(value).flatMap(stringTargets)
  return []
}

const packageNameFromSpecifier = (specifier) => {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

const subpathFromSpecifier = (specifier, packageName) => {
  const suffix = specifier.slice(packageName.length)
  return suffix === "" ? "." : `.${suffix}`
}

const walkFiles = (directory, extensions) => {
  const files = []
  if (!existsSync(directory)) return files
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || ignoredDirectories.has(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(path, extensions))
    else if (entry.isFile() && (extensions === undefined || extensions.has(entry.name.slice(entry.name.lastIndexOf("."))))) {
      files.push(path)
    }
  }
  return files
}

const matchingExportEntries = (entries, subpath) => entries.flatMap(([key, value]) => {
  if (key === subpath) return [{ key, value, capture: "" }]
  const star = key.indexOf("*")
  if (star === -1 || !subpath.startsWith(key.slice(0, star)) || !subpath.endsWith(key.slice(star + 1))) return []
  return [{ key, value, capture: subpath.slice(star, subpath.length - (key.length - star - 1)) }]
})

const concreteExportTargetExists = (workspacePackage, target, capture) => {
  if (!target.startsWith("./")) return false
  const concreteTarget = target.replaceAll("*", capture)
  const targetPath = resolve(workspacePackage.directory, concreteTarget)
  return isInside(workspacePackage.directory, targetPath) && existsSync(targetPath)
}

const exportedSubpathExists = (workspacePackage, subpath) => matchingExportEntries(workspacePackage.exports, subpath)
  .some(({ value, capture }) => stringTargets(value)
    .some((target) => concreteExportTargetExists(workspacePackage, target, capture)))

const exportedFile = (workspacePackage, file) => {
  const packageRelativeFile = `./${toPosix(relative(workspacePackage.directory, file))}`
  return workspacePackage.exports.some(([, value]) => stringTargets(value).some((target) => {
    if (!target.startsWith("./")) return false
    return target === packageRelativeFile || wildcardMatch(target, packageRelativeFile)
  }))
}

const packageDirectories = discoverPackages()
const packages = packageDirectories.map((directory) => {
  const manifestPath = resolve(directory, "package.json")
  const manifest = readJson(manifestPath)
  if (typeof manifest.name !== "string" || manifest.name.length === 0) {
    addError("package-name", relative(root, manifestPath), "workspace packages must have a name")
  }
  const tsconfigPath = resolve(directory, "tsconfig.json")
  const tsconfig = existsSync(tsconfigPath) ? ts.readConfigFile(tsconfigPath, ts.sys.readFile) : undefined
  const parsedConfig = tsconfig?.config
    ? ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, directory, undefined, tsconfigPath)
    : undefined
  return {
    directory,
    manifest,
    manifestPath,
    exports: exportEntries(manifest.exports),
    compilerOptions: parsedConfig?.options ?? {},
    pathAliases: Object.keys(parsedConfig?.options.paths ?? {}),
    files: walkFiles(directory)
  }
})

const packagesByName = new Map()
for (const workspacePackage of packages) {
  const { manifest, manifestPath } = workspacePackage
  if (packagesByName.has(manifest.name)) {
    addError("package-name", relative(root, manifestPath), `duplicate workspace name ${manifest.name}`)
  } else if (typeof manifest.name === "string") {
    packagesByName.set(manifest.name, workspacePackage)
  }

  const dependencyLocations = new Map()
  for (const section of dependencySections) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      const locations = dependencyLocations.get(dependency) ?? []
      locations.push(section)
      dependencyLocations.set(dependency, locations)
    }
  }
  for (const [dependency, sections] of dependencyLocations) {
    if (sections.length > 1) {
      addError(
        "duplicate-dependency",
        relative(root, manifestPath),
        `${dependency} is declared in ${sections.join(", ")}`
      )
    }
  }

  for (const [subpath, value] of workspacePackage.exports) {
    for (const target of stringTargets(value)) {
      if (!target.startsWith("./")) {
        addError("export-target", relative(root, manifestPath), `${subpath} target ${target} is not package-relative`)
        continue
      }
      const targetPath = resolve(workspacePackage.directory, target.replaceAll("*", "__wildcard__"))
      if (!isInside(workspacePackage.directory, targetPath)) {
        addError("export-target", relative(root, manifestPath), `${subpath} target ${target} escapes the package`)
      } else if (target.includes("*")) {
        const matchesFile = workspacePackage.files.some((file) => {
          const packageRelativeFile = `./${toPosix(relative(workspacePackage.directory, file))}`
          return wildcardMatch(target, packageRelativeFile)
        })
        if (!matchesFile) {
          addError("export-target", relative(root, manifestPath), `${subpath} target ${target} matches no files`)
        }
      } else if (!existsSync(targetPath)) {
        addError("export-target", relative(root, manifestPath), `${subpath} target ${target} does not exist`)
      }
    }
  }
}

const packageContaining = (file) => packages
  .filter((workspacePackage) => isInside(workspacePackage.directory, file))
  .sort((left, right) => right.directory.length - left.directory.length)[0]

const aliasMatches = (aliases, specifier) => aliases.some((alias) => alias === specifier || wildcardMatch(alias, specifier))

for (const workspacePackage of packages) {
  const declared = new Set(dependencySections.flatMap((section) => Object.keys(workspacePackage.manifest[section] ?? {})))
  for (const file of walkFiles(workspacePackage.directory, sourceExtensions)) {
    const source = readFileSync(file, "utf8")
    const imports = ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName)

    for (const specifier of imports) {
      if (specifier.includes("://") || specifier.startsWith("#") || isBuiltin(specifier)) continue

      const location = relative(root, file)
      const dependency = packageNameFromSpecifier(specifier)
      const namedTargetPackage = packagesByName.get(dependency)
      if (namedTargetPackage) {
        if (dependency !== workspacePackage.manifest.name && !declared.has(dependency)) {
          addError("undeclared-dependency", location, `${specifier} requires a direct declaration for ${dependency}`)
        }
        const subpath = subpathFromSpecifier(specifier, dependency)
        if (!exportedSubpathExists(namedTargetPackage, subpath)) {
          addError("unexported-subpath", location, `${specifier} is not backed by an existing export target in ${dependency}`)
        }
        continue
      }

      const resolvedModule = ts.resolveModuleName(
        specifier,
        file,
        workspacePackage.compilerOptions,
        ts.sys
      ).resolvedModule?.resolvedFileName
      const resolvedTargetPackage = resolvedModule === undefined ? undefined : packageContaining(resolve(resolvedModule))
      if (resolvedTargetPackage && resolvedTargetPackage !== workspacePackage) {
        const targetName = resolvedTargetPackage.manifest.name
        if (typeof targetName === "string" && !declared.has(targetName)) {
          addError("undeclared-dependency", location, `${specifier} crosses into ${targetName} and requires a direct declaration`)
        }
        if (!exportedFile(resolvedTargetPackage, resolve(resolvedModule))) {
          addError(
            "unexported-subpath",
            location,
            `${specifier} resolves to ${toPosix(relative(root, resolvedModule))}, which is not exported by ${targetName}`
          )
        }
        continue
      }

      if (
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        aliasMatches(workspacePackage.pathAliases, specifier)
      ) continue

      if (dependency !== workspacePackage.manifest.name && !declared.has(dependency)) {
        addError("undeclared-dependency", location, `${specifier} requires a direct declaration for ${dependency}`)
      }
    }
  }
}

const sortedErrors = [...errors].sort((left, right) => left.localeCompare(right))
if (sortedErrors.length > 0) {
  console.error(`Workspace contract check found ${sortedErrors.length} error(s):`)
  for (const error of sortedErrors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Workspace contract check passed for ${packages.length} package(s).`)
