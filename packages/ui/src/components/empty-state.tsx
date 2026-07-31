import type { ReactNode } from "react"
import { cn } from "../lib/cn.js"
import { Heading, Text } from "./typography.js"

export interface EmptyStateProps {
  readonly title: string
  readonly description?: string
  readonly icon?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <section className={cn("flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center", className)}>
      {icon === undefined ? null : (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <Heading level={3}>{title}</Heading>
      {description === undefined ? null : <Text className="mt-2 max-w-md" tone="muted">{description}</Text>}
      {action === undefined ? null : <div className="mt-5">{action}</div>}
    </section>
  )
}
