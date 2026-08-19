import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"

const webRoot = resolve(process.env.WEB_ROOT ?? "/app/web")
const adminRoot = resolve(process.env.ADMIN_ROOT ?? "/app/admin")
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3000"
const port = Number.parseInt(process.env.PORT ?? "8080", 10)
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"], [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".png", "image/png"],
  [".svg", "image/svg+xml"], [".webp", "image/webp"], [".woff", "font/woff"],
  [".woff2", "font/woff2"],
])

const proxy = async (request, response, prefix) => {
  const incoming = new URL(request.url ?? "/", "http://preview.local")
  const target = new URL(apiOrigin)
  target.pathname = incoming.pathname.slice(prefix.length) || "/"
  target.search = incoming.search
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && !new Set(["host", "content-length", "connection"]).has(name)) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value)
    }
  }
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : Buffer.concat(await Array.fromAsync(request))
  const upstream = await fetch(target, { method: request.method, headers, body, redirect: "manual" })
  response.statusCode = upstream.status
  upstream.headers.forEach((value, name) => {
    if (!new Set(["content-length", "transfer-encoding", "connection", "set-cookie"]).has(name)) response.setHeader(name, value)
  })
  const cookies = upstream.headers.getSetCookie()
  if (cookies.length > 0) response.setHeader("set-cookie", cookies)
  response.end(Buffer.from(await upstream.arrayBuffer()))
}

const serve = (request, response, root, pathname) => {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([.][.]\/)+/, "").replace(/^\/+/, "")
  let file = join(root, relative)
  if (!file.startsWith(`${root}/`) || !existsSync(file) || !statSync(file).isFile()) file = join(root, "index.html")
  response.statusCode = 200
  response.setHeader("content-type", contentTypes.get(extname(file)) ?? "application/octet-stream")
  response.setHeader("cache-control", file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable")
  createReadStream(file).pipe(response)
}

createServer((request, response) => {
  const operation = async () => {
    const pathname = new URL(request.url ?? "/", "http://preview.local").pathname
    if (pathname === "/healthz") {
      const upstream = await fetch(`${apiOrigin}/openapi.public.json`)
      response.statusCode = upstream.ok ? 204 : 503
      response.end()
    } else if (pathname.startsWith("/admin-api")) {
      await proxy(request, response, "/admin-api")
    } else if (pathname.startsWith("/api")) {
      await proxy(request, response, "/api")
    } else if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      serve(request, response, adminRoot, pathname.replace(/^\/admin\/?/, ""))
    } else {
      serve(request, response, webRoot, pathname)
    }
  }
  operation().catch((error) => {
    console.error(error)
    if (!response.headersSent) response.statusCode = 502
    response.end()
  })
}).listen(port, "0.0.0.0")
