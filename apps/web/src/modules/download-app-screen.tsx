import { registration_download_description, registration_download_title } from "../paraglide/messages.js"
import { Button, DownloadLayout } from "@proxus/ui"

const withCurrentSearch = (url: string) => {
  if (url === "") return ""
  const target = new URL(url)
  const current = new URLSearchParams(globalThis.location.search)
  for (const [key, value] of current) target.searchParams.append(key, value)
  return target.toString()
}

export function DownloadAppPage() {
  const appStoreUrl = withCurrentSearch(import.meta.env.VITE_APP_STORE_URL ?? "")
  const playStoreUrl = withCurrentSearch(import.meta.env.VITE_PLAY_STORE_URL ?? "")
  return <DownloadLayout
    title={registration_download_title()}
    description={registration_download_description()}
    actions={
      <>
          <Button size="lg" disabled={appStoreUrl === ""} onClick={() => { globalThis.location.href = appStoreUrl }}>App Store</Button>
          <Button size="lg" disabled={playStoreUrl === ""} variant="secondary" onClick={() => { globalThis.location.href = playStoreUrl }}>Google Play</Button>
      </>
    }
  />
}
