import { Data } from "effect"

export interface SourceLocation { readonly offset: number; readonly line: 1; readonly column: number }
export interface ParsedCall { readonly name: string; readonly arguments: ReadonlyArray<unknown>; readonly location: SourceLocation }
export interface ParsedChain { readonly root: string; readonly calls: ReadonlyArray<ParsedCall> }

export class DslParseFailure extends Data.TaggedError("DslParseFailure")<{
  readonly code: string; readonly message: string; readonly location: SourceLocation
}> {}

const location = (offset: number): SourceLocation => ({ offset, line: 1, column: offset + 1 })
const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/

/** Parses only a root followed by dot calls whose arguments are JSON values. */
export const parseDslChain = (source: string): ParsedChain => {
  const fail = (code: string, message: string, at: number): never => { throw new DslParseFailure({ code, message, location: location(at) }) }
  if (/\r|\n/.test(source)) fail("MULTILINE_SOURCE", "DSL source must be one line", Math.max(source.search(/[\r\n]/), 0))
  let index = 0
  const skip = () => { while (index < source.length && /\s/.test(source[index]!)) index++ }
  skip()
  const rootMatch = identifier.exec(source.slice(index))
  if (rootMatch === null) fail("EXPECTED_ROOT", "Expected a declared root identifier", index)
  const root = rootMatch![0]!; index += root.length
  const calls: Array<ParsedCall> = []
  while (true) {
    skip()
    if (index >= source.length) break
    if (source[index] !== ".") fail("FORBIDDEN_SYNTAX", "Expected a method call; variables, assignments and multiple expressions are forbidden", index)
    const start = index++
    const match = identifier.exec(source.slice(index))
    if (match === null) fail("EXPECTED_METHOD", "Expected a static method name after '.'", index)
    const name = match![0]!; index += name.length; skip()
    if (source[index] !== "(") fail("EXPECTED_CALL", `Expected '(' after ${name}`, index)
    index++; skip()
    const args: Array<unknown> = []
    if (source[index] !== ")") {
      while (true) {
        const valueStart = index
        let value: unknown
        try {
          // JSON.parse itself is not used to find boundaries: the scanner respects strings and nesting.
          let depth = 0, quoted = false, escaped = false, end = index
          for (; end < source.length; end++) {
            const c = source[end]!
            if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue }
            if (c === '"') { quoted = true; continue }
            if (c === "[" || c === "{") depth++
            else if (c === "]" || c === "}") { if (depth === 0) break; depth-- }
            else if (depth === 0 && (c === "," || c === ")")) break
          }
          if (quoted || depth !== 0) fail("INVALID_JSON", "Unterminated JSON argument", valueStart)
          const raw = source.slice(valueStart, end).trim()
          if (raw.length === 0) fail("EXPECTED_ARGUMENT", "Expected a JSON-compatible argument", valueStart)
          value = JSON.parse(raw)
          index = end
        } catch (error) {
          if (error instanceof DslParseFailure) throw error
          fail("INVALID_JSON", "Arguments must be JSON-compatible literals", valueStart)
        }
        args.push(value); skip()
        if (source[index] === ",") { index++; skip(); continue }
        if (source[index] === ")") break
        fail("EXPECTED_ARGUMENT_SEPARATOR", "Expected ',' or ')'", index)
      }
    }
    index++
    calls.push({ name, arguments: args, location: location(start) })
  }
  if (calls.length === 0) fail("EXPECTED_CALL", "A root must be followed by at least one call", index)
  return { root, calls }
}
