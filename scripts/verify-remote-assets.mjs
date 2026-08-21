import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const configuredOrigin = process.argv[2] ?? process.env.ASSET_BASE_URL
if (configuredOrigin === undefined || configuredOrigin === "") {
  throw new Error("Pass the asset base URL as the first argument or ASSET_BASE_URL")
}
const origin = new URL(configuredOrigin)
if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
  throw new Error("The remote asset origin must use HTTPS")
}

const manifest = JSON.parse(await readFile(new URL("../packages/assets/manifest.json", import.meta.url), "utf8"))
const authorization = process.env.ASSET_AUTHORIZATION
const headers = authorization === undefined ? {} : { authorization }
const errors = []

for (const [id, asset] of Object.entries(manifest)) {
  const url = new URL(asset.path, origin)
  try {
    const response = await fetch(url, { headers, redirect: "error" })
    if (!response.ok) {
      errors.push(`${id}: ${response.status} ${url}`)
      continue
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]
    const contents = Buffer.from(await response.arrayBuffer())
    const hash = createHash("sha256").update(contents).digest("hex")
    if (contentType !== asset.mimeType) errors.push(`${id}: expected ${asset.mimeType}, received ${contentType ?? "no content-type"}`)
    if (contents.byteLength !== asset.bytes) errors.push(`${id}: expected ${asset.bytes} bytes, received ${contents.byteLength}`)
    if (hash !== asset.sha256) errors.push(`${id}: remote sha256 does not match the manifest`)
  } catch (error) {
    errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (errors.length > 0) {
  process.stderr.write(`Remote asset verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Verified ${Object.keys(manifest).length} assets at ${origin.href}.\n`)
}
