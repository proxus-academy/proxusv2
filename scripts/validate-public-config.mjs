const target = process.argv[2]
const contracts = {
  web: ["PUBLIC_WEBAPP_URL"],
  webapp: ["VITE_WEB_URL", "VITE_ASSET_BASE_URL"],
}
const names = contracts[target]
if (names === undefined) throw new Error(`Unknown public configuration target: ${target ?? "<missing>"}`)

for (const name of names) {
  const value = process.env[name]
  if (value === undefined || value === "") throw new Error(`${name} is required for a production build`)
  const url = value.startsWith("/") ? new URL(value, "https://runtime.proxus.invalid") : new URL(value)
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS or a root-relative URL`)
  if (url.username !== "" || url.password !== "") throw new Error(`${name} must not contain credentials`)
  if (url.search !== "" || url.hash !== "") throw new Error(`${name} must not contain a query or fragment`)
}

process.stdout.write(`Validated ${target} production configuration.\n`)
