import { common_back, registration_progress, registration_providerGoogle } from "../../paraglide/messages.js"
import { Button, Progress, Text } from "@proxus/ui"
import type { ReactNode } from "react"

export function RegistrationPageShell({ children, wide = false, step, totalSteps, provider, onBack }: {
  readonly children: ReactNode
  readonly wide?: boolean
  readonly step?: number
  readonly totalSteps?: number
  readonly provider?: "email" | "google"
  readonly onBack?: () => void
}) {
  const progress = step === undefined || totalSteps === undefined ? undefined : step / totalSteps * 100
  const progressLabel = step === undefined || totalSteps === undefined
    ? undefined
    : registration_progress({ current: step, total: totalSteps })
  return (
    <div className="registration-shell min-h-screen px-5 py-8 text-foreground md:px-8 md:py-10">
      <div className="registration-glow registration-glow-primary" aria-hidden="true" />
      <div className="registration-glow registration-glow-secondary" aria-hidden="true" />
      <section className={`registration-frame relative mx-auto ${wide ? "max-w-7xl" : "max-w-4xl"}`}>
        <header className="mb-8 md:mb-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <Text className="brand-wordmark">PROXUS</Text>
            {provider === "google" ? <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{registration_providerGoogle()}</span> : null}
          </div>
          {progress === undefined ? null : (
            <>
              <div className="mb-2 flex items-center justify-between">
                {onBack === undefined ? <span /> : <Button variant="ghost" onClick={onBack}>{common_back()}</Button>}
                <Text className="text-sm" tone="muted">{progressLabel}</Text>
              </div>
              <Progress className="h-2.5 bg-primary/10" value={progress} aria-label={progressLabel} />
            </>
          )}
        </header>
        <div className="registration-surface">{children}</div>
      </section>
    </div>
  )
}
