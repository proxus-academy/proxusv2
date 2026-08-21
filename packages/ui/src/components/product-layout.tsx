import type { ReactNode } from "react"
import { Button } from "./button.js"
import { Progress } from "./progress.js"
import { Heading, Text } from "./typography.js"

function AmbientGlow() {
  return <><div className="product-glow product-glow-primary" aria-hidden="true" /><div className="product-glow product-glow-secondary" aria-hidden="true" /></>
}

export function BrandWordmark() {
  return <Text as="span" className="brand-wordmark">PROXUS</Text>
}

export function AuthLayout({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <main className="product-shell auth-layout">
    <AmbientGlow />
    <section className="product-surface auth-surface">
      <BrandWordmark />
      <Heading level={1} className="auth-title">{title}</Heading>
      <div className="auth-content">{children}</div>
    </section>
  </main>
}

export function DownloadLayout({ title, description, actions }: { readonly title: string; readonly description: string; readonly actions: ReactNode }) {
  return <main className="product-shell download-layout">
    <AmbientGlow />
    <section className="product-surface download-surface">
      <BrandWordmark />
      <Heading level={1}>{title}</Heading>
      <Text className="download-description" tone="muted">{description}</Text>
      <div className="download-actions">{actions}</div>
    </section>
  </main>
}

export function RegistrationLayout({ children, wide = false, providerLabel, progress, progressLabel, backLabel, onBack }: {
  readonly children: ReactNode
  readonly wide?: boolean
  readonly providerLabel?: string | undefined
  readonly progress?: number | undefined
  readonly progressLabel?: string | undefined
  readonly backLabel: string
  readonly onBack?: (() => void) | undefined
}) {
  return <div className="product-shell registration-layout">
    <AmbientGlow />
    <section className={wide ? "registration-frame registration-frame-wide" : "registration-frame"}>
      <header className="registration-header">
        <div className="registration-brand-row"><BrandWordmark />{providerLabel === undefined ? null : <Text as="span" className="provider-badge">{providerLabel}</Text>}</div>
        {progress === undefined ? null : <>
          <div className="registration-progress-row">
            {onBack === undefined ? <span /> : <Button variant="ghost" onClick={onBack}>{backLabel}</Button>}
            <Text size="sm" tone="muted">{progressLabel}</Text>
          </div>
          <Progress value={progress} aria-label={progressLabel} />
        </>}
      </header>
      <div className="registration-surface">{children}</div>
    </section>
  </div>
}
