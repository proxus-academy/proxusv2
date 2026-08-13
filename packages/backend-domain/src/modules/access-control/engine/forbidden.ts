/**
 * Adapted from effect-access 0.1.0, commit 134768b.
 * Copyright JavierDeDiegoGuzman. See THIRD_PARTY_NOTICES.md.
 */
import { Data } from "effect"
import type { Resource, Subject } from "./types.js"

export class Forbidden extends Data.TaggedError("Forbidden")<{
  readonly message: string
  readonly permission?: string
  readonly subject?: Subject
  readonly resource?: Resource
  readonly reasons?: readonly Forbidden[]
}> {}

export const forbidden = (input: {
  readonly permission?: string
  readonly subject?: Subject
  readonly resource?: Resource
  readonly message?: string
  readonly reasons?: readonly Forbidden[]
}): Forbidden =>
  new Forbidden({
    message: input.message ?? "Forbidden",
    ...(input.permission !== undefined ? { permission: input.permission } : undefined),
    ...(input.subject !== undefined ? { subject: input.subject } : undefined),
    ...(input.resource !== undefined ? { resource: input.resource } : undefined),
    ...(input.reasons !== undefined ? { reasons: input.reasons } : undefined)
  })
