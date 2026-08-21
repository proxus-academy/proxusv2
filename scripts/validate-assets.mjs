import { createHash } from "node:crypto"
import { readFile, readdir, stat } from "node:fs/promises"
import { extname, relative, resolve, sep } from "node:path"
import sharp from "sharp"

const workspaceRoot = resolve(import.meta.dirname, "..")
const packageRoot = resolve(workspaceRoot, "packages/assets")
const publicRoot = resolve(workspaceRoot, "apps/web/public")
const assetsRoot = resolve(publicRoot, "assets")
const manifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8"))
const allowedExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"])
const mimeTypes = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
}
const errors = []

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  }))
  return files.flat()
}

const publicPath = (path) => `/${relative(publicRoot, path).split(sep).join("/")}`
const files = (await walk(assetsRoot)).filter((path) => allowedExtensions.has(extname(path).toLowerCase()))
const paths = new Map()
const hashes = new Map()

for (const [id, entry] of Object.entries(manifest)) {
  if (!/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/.test(id)) errors.push(`${id}: invalid asset id`)
  if (!entry.path.startsWith("/assets/")) errors.push(`${id}: path must start with /assets/`)
  if (entry.path !== entry.path.toLowerCase() || /[\s%]/.test(entry.path)) errors.push(`${id}: path must be lowercase and URL-safe`)
  if (paths.has(entry.path)) errors.push(`${id}: path is already owned by ${paths.get(entry.path)}`)
  paths.set(entry.path, id)

  const file = resolve(publicRoot, `.${entry.path}`)
  let contents
  try {
    contents = await readFile(file)
  } catch {
    errors.push(`${id}: missing file ${entry.path}`)
    continue
  }

  const fileStat = await stat(file)
  const extension = extname(file).toLowerCase()
  const hash = createHash("sha256").update(contents).digest("hex")
  const metadata = await sharp(contents).metadata()
  if (fileStat.size === 0) errors.push(`${id}: file is empty`)
  if (fileStat.size > 500_000) errors.push(`${id}: file exceeds the 500 KB budget`)
  if (entry.bytes !== fileStat.size) errors.push(`${id}: expected ${entry.bytes} bytes, found ${fileStat.size}`)
  if (entry.sha256 !== hash) errors.push(`${id}: sha256 does not match the published content`)
  if (entry.mimeType !== mimeTypes[extension]) errors.push(`${id}: mimeType does not match ${extension}`)
  if (entry.width !== metadata.width || entry.height !== metadata.height) {
    errors.push(`${id}: dimensions are ${metadata.width}x${metadata.height}, manifest says ${entry.width}x${entry.height}`)
  }
  if (hashes.has(hash)) errors.push(`${id}: duplicates the content of ${hashes.get(hash)}`)
  hashes.set(hash, id)
}

for (const file of files) {
  const path = publicPath(file)
  if (!paths.has(path)) errors.push(`${path}: public image is not registered in the manifest`)
}
for (const path of paths.keys()) {
  if (!files.some((file) => publicPath(file) === path)) errors.push(`${path}: manifest path is not a supported image`)
}

const forbiddenRoots = [resolve(workspaceRoot, "apps/webapp/public/assets"), resolve(workspaceRoot, "apps/webapp/src/assets")]
for (const root of forbiddenRoots) {
  try {
    const forbiddenFiles = await walk(root)
    if (forbiddenFiles.length > 0) errors.push(`${relative(workspaceRoot, root)} must remain empty; assets belong to apps/web/public/assets`)
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
}

if (errors.length > 0) {
  process.stderr.write(`Asset contract failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Validated ${files.length} public assets.\n`)
}
