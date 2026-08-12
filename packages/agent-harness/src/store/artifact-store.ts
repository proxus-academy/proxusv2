import { Context, Effect } from "effect"
import type { ArtifactId, RunId } from "../ids.js"

export type ArtifactClassification = "internal" | "confidential" | "encrypted-debug"
export interface ArtifactAccess { readonly tenantId: string; readonly runId: RunId; readonly roles: ReadonlyArray<"reader" | "operator" | "retention"> }
export interface StoredArtifactReference {
  readonly id: ArtifactId
  readonly runId: RunId
  readonly tenantId: string
  readonly contentType: string
  readonly classification: ArtifactClassification
  readonly byteLength: number
  readonly createdAt: number
  readonly expiresAt?: number
}
export interface ArtifactPutInput { readonly id: ArtifactId; readonly runId: RunId; readonly tenantId: string; readonly contentType: string; readonly classification?: ArtifactClassification; readonly bytes: Uint8Array; readonly createdAt: number; readonly expiresAt?: number }

/** Artifact content is always run/tenant scoped. Cleanup requires the retention role. */
export class ArtifactStore extends Context.Service<ArtifactStore, {
  readonly put: (input: ArtifactPutInput) => Effect.Effect<StoredArtifactReference, Error>
  readonly get: (id: ArtifactId, access: ArtifactAccess) => Effect.Effect<Uint8Array, Error>
  readonly remove: (id: ArtifactId, access: ArtifactAccess) => Effect.Effect<void, Error>
  readonly removeExpired: (now: number, access: Omit<ArtifactAccess, "runId">) => Effect.Effect<number, Error>
}>()("@proxus/agent-harness/store/artifact-store/ArtifactStore") {}
