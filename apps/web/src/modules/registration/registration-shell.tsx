import { common_back, registration_progress, registration_providerGoogle } from "../../paraglide/messages.js"
import { RegistrationLayout } from "@proxus/ui"
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
  return <RegistrationLayout
    wide={wide}
    providerLabel={provider === "google" ? registration_providerGoogle() : undefined}
    progress={progress}
    progressLabel={progressLabel}
    backLabel={common_back()}
    onBack={onBack}
  >{children}</RegistrationLayout>
}
