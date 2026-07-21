import ts from "typescript"
import { ruleForModule, type EffectReplacementRule } from "./rules.js"

export interface EffectLintDiagnostic {
  readonly ruleId: string
  readonly file: string
  readonly line: number
  readonly column: number
  readonly moduleName: string
  readonly message: string
  readonly alternatives: ReadonlyArray<string>
}

const ignoredDirectories = [".git", ".repos", "dist", "node_modules", "coverage", ".turbo"]
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]

const moduleLiteral = (node: ts.Node): ts.StringLiteralLike | undefined => {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const specifier = node.moduleSpecifier
    return specifier !== undefined && ts.isStringLiteralLike(specifier)
      ? specifier
      : undefined
  }
  if (ts.isCallExpression(node) && node.arguments.length === 1) {
    const argument = node.arguments[0]
    if (argument !== undefined && ts.isStringLiteralLike(argument)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return argument
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") return argument
    }
  }
  return undefined
}

const workspaceRelative = (root: string, file: string): string => {
  const prefix = root.endsWith("/") ? root : `${root}/`
  return file.startsWith(prefix) ? file.slice(prefix.length) : file
}

const diagnostic = (
  root: string,
  file: string,
  source: ts.SourceFile,
  literal: ts.StringLiteralLike,
  rule: EffectReplacementRule,
): EffectLintDiagnostic => {
  const position = source.getLineAndCharacterOfPosition(literal.getStart(source))
  return {
    ruleId: rule.id,
    file: workspaceRelative(root, file),
    line: position.line + 1,
    column: position.character + 1,
    moduleName: literal.text,
    message: rule.message,
    alternatives: rule.alternatives,
  }
}

export const checkSource = (root: string, file: string, text: string): ReadonlyArray<EffectLintDiagnostic> => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const output: EffectLintDiagnostic[] = []
  const visit = (node: ts.Node): void => {
    const literal = moduleLiteral(node)
    if (literal !== undefined) {
      const rule = ruleForModule(literal.text)
      if (rule !== undefined) output.push(diagnostic(root, file, source, literal, rule))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return output
}

export const checkWorkspace = (workspace: string): ReadonlyArray<EffectLintDiagnostic> => {
  const root = ts.sys.resolvePath(workspace).replaceAll("\\", "/")
  const files = ts.sys.readDirectory(root, sourceExtensions, ignoredDirectories.map((directory) => `**/${directory}/**`))
  return files.flatMap((file) => {
    const text = ts.sys.readFile(file)
    return text === undefined ? [] : checkSource(root, file.replaceAll("\\", "/"), text)
  })
}
