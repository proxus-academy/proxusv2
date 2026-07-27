import { Heading, Text } from "@proxus/ui"
import type { ReactNode } from "react"

export function AuthPage({ title, children }: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <section className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center">
        <Text className="mb-3 font-bold text-primary">PROXUS</Text>
        <Heading level={1}>{title}</Heading>
        <div className="mt-7 space-y-4">{children}</div>
      </section>
    </main>
  )
}
