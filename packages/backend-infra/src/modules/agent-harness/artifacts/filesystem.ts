// @effect-diagnostics nodeBuiltinImport:off globalErrorInEffectCatch:off globalErrorInEffectFailure:off asyncFunction:off preferSchemaOverJson:off
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { ArtifactStore, type ArtifactAccess, type StoredArtifactReference } from "@proxus/agent-harness/store"
import { Effect, Layer } from "effect"

interface Metadata extends StoredArtifactReference {}
const failure = (error: unknown) => error instanceof Error ? error : new Error(String(error))
const metadataPath = (root: string, runId: string, id: string) => resolve(root, runId, `${id}.json`)
const authorize = (metadata: Metadata, access: ArtifactAccess, role: "reader" | "retention") => {
  if (metadata.runId !== access.runId || metadata.tenantId !== access.tenantId || !access.roles.includes(role)) throw new Error("Artifact access denied")
}

export const filesystemArtifactStoreLayer = (root: string): Layer.Layer<ArtifactStore> => Layer.succeed(ArtifactStore, ArtifactStore.of({
  put: (input) => Effect.tryPromise({ try: async () => {
    if (input.expiresAt <= input.createdAt) throw new Error("Artifact expiry must follow creation")
    const directory = resolve(root, input.runId)
    await mkdir(directory, { recursive: true })
    const data = resolve(directory, `${input.id}.bin`)
    const temporary = `${data}.${process.pid}.tmp`
    await writeFile(temporary, input.bytes, { flag: "wx", mode: 0o600 })
    await rename(temporary, data)
    const metadata: Metadata = { id: input.id, runId: input.runId, tenantId: input.tenantId, contentType: input.contentType, classification: input.classification ?? "confidential", byteLength: input.bytes.byteLength, createdAt: input.createdAt, expiresAt: input.expiresAt }
    await writeFile(metadataPath(root, input.runId, input.id), JSON.stringify(metadata), { flag: "wx", mode: 0o600 })
    return metadata
  }, catch: failure }),
  get: (id, access) => Effect.tryPromise({ try: async () => {
    const metadata = JSON.parse(await readFile(metadataPath(root, access.runId, id), "utf8")) as Metadata
    authorize(metadata, access, "reader")
    return new Uint8Array(await readFile(resolve(root, access.runId, `${id}.bin`)))
  }, catch: failure }),
  remove: (id, access) => Effect.tryPromise({ try: async () => {
    const metadata = JSON.parse(await readFile(metadataPath(root, access.runId, id), "utf8")) as Metadata
    authorize(metadata, access, "retention")
    await Promise.all([rm(resolve(root, access.runId, `${id}.bin`), { force: true }), rm(metadataPath(root, access.runId, id), { force: true })])
  }, catch: failure }),
  removeExpired: (now, access) => Effect.tryPromise({ try: async () => {
    if (!access.roles.includes("retention")) throw new Error("Artifact access denied")
    let removed = 0
    for (const runId of await readdir(root).catch(() => [])) for (const name of await readdir(resolve(root, runId)).catch(() => [])) {
      if (!name.endsWith(".json")) continue
      const metadata = JSON.parse(await readFile(resolve(root, runId, name), "utf8")) as Metadata
      if (metadata.tenantId !== access.tenantId || metadata.expiresAt > now) continue
      await Promise.all([rm(resolve(root, runId, `${metadata.id}.bin`), { force: true }), rm(resolve(root, runId, name), { force: true })]); removed++
    }
    return removed
  }, catch: failure }),
}))
