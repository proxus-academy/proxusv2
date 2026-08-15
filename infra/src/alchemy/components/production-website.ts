// @effect-diagnostics anyUnknownInErrorContext:off
import { createHash } from "node:crypto"
import * as GCP from "@microagi/alchemy-gcp"
import type { Output } from "alchemy/Output"
import { retain } from "alchemy/RemovalPolicy"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { BackendBucket, ServiceIdentity } from "../providers/cdn.ts"
import { StateBucket } from "../providers/state-bucket.ts"
import { StorageObject, type SourceFileDescriptor } from "../providers/storage-object.ts"

export interface ArtifactManifestFile extends SourceFileDescriptor {
  /** POSIX path relative to the artifact root and the resulting object name. */
  readonly name: string
}
export interface ArtifactManifest {
  /** Files are discovered before Alchemy starts. The component never walks the filesystem. */
  readonly files: ReadonlyArray<ArtifactManifestFile>
}
export interface ProductionWebsiteProps {
  readonly project: string
  readonly bucketName: string
  readonly bucketLocation: string
  readonly manifest: ArtifactManifest
}
export interface ProductionWebsiteOutputs {
  readonly bucketName: string | Output<string>
  readonly backendBucket: { readonly name: string | Output<string>; readonly id: string | Output<string>; readonly selfLink: string | Output<string> }
  readonly cdnServiceIdentity: { readonly email: string | Output<string>; readonly member: string | Output<string> }
  readonly objects: ReadonlyArray<{ readonly name: string | Output<string>; readonly sha256: string | Output<string>; readonly generation: string | Output<string> }>
}
export class ProductionWebsiteConfigurationError extends Data.TaggedError("ProductionWebsiteConfigurationError")<{ readonly message: string }> {}

type Value = string | Output<string>
interface Components {
  readonly bucket: (id: string, props: { readonly project: string; readonly name: string; readonly location: string; readonly deletionProtection: boolean }) => Effect.Effect<{ readonly name: Value }, unknown, unknown>
  readonly object: (id: string, props: { readonly bucket: string; readonly name: string; readonly source: SourceFileDescriptor; readonly contentType: string; readonly cacheControl: string }) => Effect.Effect<{ readonly name: Value; readonly generation: Value }, unknown, unknown>
  readonly identity: (id: string, props: { readonly project: string; readonly service: "cloudcdn.googleapis.com" }) => Effect.Effect<{ readonly email: Value; readonly member: Value }, unknown, unknown>
  readonly iam: (id: string, props: { readonly bucket: string; readonly role: string; readonly member: string }) => Effect.Effect<unknown, unknown, unknown>
  readonly backend: (id: string, props: { readonly project: string; readonly name: string; readonly bucketName: string; readonly description: string; readonly deletionProtection: boolean }) => Effect.Effect<{ readonly name: Value; readonly id: Value; readonly selfLink: Value }, unknown, unknown>
}
const real: Components = {
  bucket: (id, props) => StateBucket(id, props).pipe(retain()),
  object: (id, props) => StorageObject(id, props),
  identity: (id, props) => ServiceIdentity(id, props),
  iam: (id, props) => GCP.StorageBucketIamMember(id, props),
  backend: (id, props) => BackendBucket(id, props).pipe(retain()),
}
const contentTypes: Readonly<Record<string, string>> = {
  css: "text/css; charset=utf-8", html: "text/html; charset=utf-8", ico: "image/x-icon",
  js: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", png: "image/png",
  svg: "image/svg+xml", webp: "image/webp", woff2: "font/woff2", webmanifest: "application/manifest+json; charset=utf-8",
}
const fail = (message: string): never => { throw new ProductionWebsiteConfigurationError({ message }) }
const validateManifest = (manifest: ArtifactManifest) => {
  const names = new Set<string>()
  for (const file of manifest.files) {
    if (file.name.startsWith("/") || file.name.includes("\\") || file.name.split("/").some((part) => part === "" || part === "." || part === "..")) fail(`invalid artifact path: ${file.name}`)
    if (names.has(file.name)) fail(`duplicate artifact path: ${file.name}`)
    if (!/^[a-f0-9]{64}$/.test(file.sha256)) fail(`invalid sha256 for artifact: ${file.name}`)
    if (!Number.isSafeInteger(file.size) || file.size < 0) fail(`invalid size for artifact: ${file.name}`)
    names.add(file.name)
  }
  if (!names.has("index.html")) fail("artifact manifest must contain index.html")
}
const mime = (name: string) => contentTypes[name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : ""] ?? "application/octet-stream"
const objectId = (file: ArtifactManifestFile) => `ProductionWebsite-Object-${file.sha256.slice(0, 16)}-${createHash("sha256").update(file.name).digest("hex").slice(0, 8)}`

/** Pure manifest composition seam: source descriptors are consumed only by the StorageObject provider during upload. */
export const composeProductionWebsite = (props: ProductionWebsiteProps, components: Components) => {
  validateManifest(props.manifest)
  return Effect.gen(function* () {
    const bucket = yield* components.bucket("ProductionWebsite-Bucket", { project: props.project, name: props.bucketName, location: props.bucketLocation, deletionProtection: true })
    const objects: Array<{ readonly resource: { readonly name: Value; readonly generation: Value }; readonly sha256: string }> = []
    for (const file of [...props.manifest.files].sort((a, b) => a.name.localeCompare(b.name))) {
      const resource = yield* components.object(objectId(file), { bucket: bucket.name as string, name: file.name, source: { path: file.path, sha256: file.sha256, size: file.size }, contentType: mime(file.name), cacheControl: file.name === "index.html" ? "no-cache, max-age=0" : "public, max-age=31536000, immutable" })
      objects.push({ resource, sha256: file.sha256 })
    }
    const identity = yield* components.identity("ProductionWebsite-CdnServiceIdentity", { project: props.project, service: "cloudcdn.googleapis.com" })
    const backend = yield* components.backend("ProductionWebsite-BackendBucket", { project: props.project, name: "proxus-production-website", bucketName: bucket.name as string, description: "Private production website origin served by Cloud CDN", deletionProtection: true })
    yield* components.iam("ProductionWebsite-CdnObjectViewer", { bucket: bucket.name as string, role: "roles/storage.objectViewer", member: identity.member as string })
    return { bucketName: bucket.name, backendBucket: backend, cdnServiceIdentity: identity, objects: objects.map(({ resource, sha256 }) => ({ name: resource.name, sha256, generation: resource.generation })) } satisfies ProductionWebsiteOutputs
  })
}
export const ProductionWebsite = (props: ProductionWebsiteProps) => composeProductionWebsite(props, real)
