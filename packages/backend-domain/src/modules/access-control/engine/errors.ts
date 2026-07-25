/**
 * Adapted from effect-access 0.1.0, commit 134768b.
 * Copyright JavierDeDiegoGuzman. See THIRD_PARTY_NOTICES.md.
 */
import { Data } from "effect"

/** Thrown when an access definition or a value crossing the access seam is invalid. */
export class AccessDefinitionError extends Data.TaggedError("AccessDefinitionError")<{
  readonly message: string
}> {}

/** A RoleStore failed or returned data that does not satisfy its runtime contract. */
export class RoleStoreError extends Data.TaggedError("RoleStoreError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
