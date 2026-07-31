import { Button, Heading, Text } from "@proxus/ui"

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
  return (
    <main className="auth-shell flex min-h-screen items-center px-6 py-12 text-foreground">
      <div className="registration-glow registration-glow-primary" aria-hidden="true" />
      <div className="registration-glow registration-glow-secondary" aria-hidden="true" />
      <section className="auth-card relative mx-auto max-w-lg text-center">
        <Text className="brand-wordmark mb-4">PROXUS</Text>
        <Heading level={1}>Proxus está diseñado para tu ordenador</Heading>
        <Text className="mt-5 leading-relaxed" tone="muted">
          Estamos preparando las aplicaciones móviles. Mientras tanto, abre este enlace en una pantalla de al menos 1024 píxeles.
        </Text>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" disabled={appStoreUrl === ""} onClick={() => { globalThis.location.href = appStoreUrl }}>App Store</Button>
          <Button size="lg" disabled={playStoreUrl === ""} variant="secondary" onClick={() => { globalThis.location.href = playStoreUrl }}>Google Play</Button>
        </div>
      </section>
    </main>
  )
}
