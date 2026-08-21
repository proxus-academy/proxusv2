export type WebappEnvironment = Readonly<{
  VITE_WEB_URL?: string
  VITE_ASSET_BASE_URL?: string
}>

export type WebappConfig = Readonly<{
  webUrl: URL
  assetBaseUrl: URL
}>

const localEnvironment: Required<WebappEnvironment> = {
  VITE_WEB_URL: "http://localhost:4321",
  VITE_ASSET_BASE_URL: "http://localhost:4321",
}

const parseBaseUrl = (name: keyof WebappEnvironment, value: string | undefined, production: boolean): URL => {
  if (value === undefined || value === "") throw new Error(`${name} is required`)
  const url = value.startsWith("/") ? new URL(value, "https://runtime.proxus.invalid") : new URL(value)
  if (production && url.protocol !== "https:") throw new Error(`${name} must use HTTPS or a root-relative URL in production`)
  if (url.username !== "" || url.password !== "") throw new Error(`${name} must not contain credentials`)
  if (url.search !== "" || url.hash !== "") throw new Error(`${name} must not contain a query or fragment`)
  return url
}

export const makeWebappConfig = (environment: WebappEnvironment, production: boolean): WebappConfig => {
  const effectiveEnvironment = production ? environment : { ...localEnvironment, ...environment }
  return {
    webUrl: parseBaseUrl("VITE_WEB_URL", effectiveEnvironment.VITE_WEB_URL, production),
    assetBaseUrl: parseBaseUrl("VITE_ASSET_BASE_URL", effectiveEnvironment.VITE_ASSET_BASE_URL, production),
  }
}

export const resolveRuntimeBaseUrl = (configuredUrl: URL, documentBaseUrl: URL): URL =>
  configuredUrl.hostname === "runtime.proxus.invalid"
    ? new URL(configuredUrl.pathname, documentBaseUrl)
    : configuredUrl
