/**
 * Adapted from effect-access 0.1.0, commit 134768b.
 * Copyright JavierDeDiegoGuzman. See THIRD_PARTY_NOTICES.md.
 */
import type { ObjectRef, Resource, Scope, Subject } from "./types.js"

const assertPart = (name: string, value: string): void => {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} must be a non-empty string`)
}

export const subject = <const Type extends string, const Id extends string>(type: Type, id: Id): Subject<Type, Id> => {
  assertPart("Subject type", type)
  assertPart("Subject id", id)
  return { type, id }
}

export const scope = <const Type extends string, const Id extends string>(type: Type, id: Id): Scope<Type, Id> => {
  assertPart("Scope type", type)
  assertPart("Scope id", id)
  return { type, id }
}

export const resource = <const Type extends string, const Id extends string>(
  type: Type,
  id: Id,
  options?: { readonly scopes?: readonly Scope[] }
): Resource<Type, Id> => {
  assertPart("Resource type", type)
  assertPart("Resource id", id)
  const scopes = options?.scopes ?? []
  if (!Array.isArray(scopes)) throw new TypeError("Resource scopes must be an array")
  return { type, id, scopes: dedupeRefs(scopes) }
}

export const isObjectRef = (value: unknown): value is ObjectRef => {
  if (typeof value !== "object" || value === null) return false
  // SAFETY: The surrounding typed contract establishes the asserted representation.
  const candidate = value as { readonly type?: unknown; readonly id?: unknown }
  return typeof candidate.type === "string" && candidate.type.length > 0 &&
    typeof candidate.id === "string" && candidate.id.length > 0
}

export const sameRef = (left: ObjectRef, right: ObjectRef): boolean =>
  left.type === right.type && left.id === right.id

const refKey = (ref: ObjectRef): string => `${ref.type.length}:${ref.type}${ref.id}`

export const dedupeRefs = <A extends ObjectRef>(refs: Iterable<A>): readonly A[] => {
  const result: A[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    if (!isObjectRef(ref)) throw new TypeError("Expected a reference with non-empty type and id")
    const key = refKey(ref)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(ref)
    }
  }
  return result
}

const resourceScope = (resource: Resource): Scope => ({ type: resource.type, id: resource.id })

export const effectiveScopes = (resource: Resource): readonly Scope[] =>
  dedupeRefs([resourceScope(resource), ...resource.scopes])
