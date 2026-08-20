const origin = process.env.PREVIEW_ORIGIN ?? "http://localhost:8080"
const checks = [
  ["health", "/healthz", 204],
  ["web", "/es", 200, { accept: "text/html" }],
  ["admin", "/admin/", 200, { accept: "text/html" }],
  ["storybook", "/ui/", 200, { accept: "text/html" }],
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

for (const [name, path, expected, headers] of checks) {
  const response = await fetch(`${origin}${path}`, { headers })
  if (response.status !== expected) throw new Error(`${name} returned ${response.status}; expected ${expected}`)
  console.log(`✓ ${name}: ${origin}${path}`)
}
