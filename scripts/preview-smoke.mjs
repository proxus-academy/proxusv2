const origin = process.env.PREVIEW_ORIGIN ?? "http://localhost:8080"
const checks = [
  ["health", "/healthz", 204],
  ["site", "/", 200, { headers: { accept: "text/html" } }, "Convierte tus apuntes"],
  ["site page", "/pricing", 200, { headers: { accept: "text/html" } }, "Empieza gratis. Mejora cuando lo necesites."],
  ["web", "/app", 200, { headers: { accept: "text/html" } }, "/app/assets/"],
  ["admin", "/admin/", 200, { headers: { accept: "text/html" } }],
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

for (const [name, path, expected, options, expectedBody] of checks) {
  const response = await fetch(`${origin}${path}`, options)
  if (response.status !== expected) throw new Error(`${name} returned ${response.status}; expected ${expected}`)
  if (expectedBody !== undefined && !(await response.text()).includes(expectedBody)) {
    throw new Error(`${name} did not contain expected content: ${expectedBody}`)
  }
  console.log(`✓ ${name}: ${origin}${path}`)
}

for (const [name, page, assetPattern] of [
  ["site asset", "/", /(?:href|src)="(\/assets\/[^"]+)"/],
  ["web asset", "/app", /(?:href|src)="(\/app\/assets\/[^"]+)"/],
]) {
  const html = await (await fetch(`${origin}${page}`)).text()
  const asset = html.match(assetPattern)?.[1]
  if (asset === undefined) throw new Error(`${name} URL was not present in ${page}`)
  const response = await fetch(`${origin}${asset}`)
  if (response.status !== 200) throw new Error(`${name} returned ${response.status}; expected 200`)
  console.log(`✓ ${name}: ${origin}${asset}`)
}
