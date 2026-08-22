const origin = process.env.PREVIEW_ORIGIN ?? "http://localhost:8080"
const checks = [
  ["health", "/healthz", 204],
  ["web", "/es", 200, { headers: { accept: "text/html" } }],
  ["admin", "/admin/", 200, { headers: { accept: "text/html" } }],
  ["ugc redirect", "/ugc", 308, { headers: { accept: "text/html" }, redirect: "manual" }],
  ["ugc", "/ugc/", 200, { headers: { accept: "text/html" } }],
  ["ugc SPA", "/ugc/videos", 200, { headers: { accept: "text/html" } }],
  ["storybook redirect", "/ui", 308, { headers: { accept: "text/html" }, redirect: "manual" }],
  ["storybook", "/ui/", 200, { headers: { accept: "text/html" } }],
  ["storybook index", "/ui/index.json", 200],
  ["public API", "/api/openapi.public.json", 200],
  ["admin API", "/admin-api/openapi.admin.json", 200],
]

for (let attempt = 1; attempt <= 60; attempt++) {
  try {
    const response = await fetch(`${origin}/healthz`)
    if (response.status === 204) break
  } catch {
    // The container may still be applying migrations and deterministic seeds.
  }
  if (attempt === 60) throw new Error(`preview did not become healthy at ${origin}`)
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}

for (const [name, path, expected, options] of checks) {
  const response = await fetch(`${origin}${path}`, options)
  if (response.status !== expected) throw new Error(`${name} returned ${response.status}; expected ${expected}`)
  console.log(`✓ ${name}: ${origin}${path}`)
}
