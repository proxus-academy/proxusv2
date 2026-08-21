import type { ReactNode } from "react"

export interface DescriptionItem {
  readonly label: string
  readonly value: ReactNode
  readonly action?: ReactNode
}

export function DescriptionList({ items }: { readonly items: ReadonlyArray<DescriptionItem> }) {
  return <dl className="space-y-4">
    {items.map((item) => <div key={item.label}>
      <dt className="text-sm font-semibold text-muted-foreground">{item.label}</dt>
      <dd className="flex items-center justify-between gap-4">{item.value}{item.action}</dd>
    </div>)}
  </dl>
}
