import { Heading, Text } from "@proxus/ui"
import type { ReactNode } from "react"

export function AuthPage({ title, children }: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <main className="auth-shell min-h-screen px-5 py-10 text-foreground">
      <div className="registration-glow registration-glow-primary" aria-hidden="true" />
      <div className="registration-glow registration-glow-secondary" aria-hidden="true" />
      <section className="auth-card relative mx-auto flex min-h-[75vh] max-w-lg flex-col justify-center">
        <Text className="brand-wordmark mb-4">PROXUS</Text>
        <Heading level={1} className="text-[2.5rem] leading-tight">{title}</Heading>
        <div className="mt-8 space-y-4">{children}</div>
      </section>
    </main>
  )
}
