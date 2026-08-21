import { AuthLayout } from "@proxus/ui"
import type { ReactNode } from "react"

export function AuthPage({ title, children }: {
  readonly title: string
  readonly children: ReactNode
}) {
  return <AuthLayout title={title}>{children}</AuthLayout>
}
