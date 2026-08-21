import { Button } from "./button.js"

export interface BreadcrumbItem {
  readonly id: string
  readonly label: string
}

export function Breadcrumbs({ label, items, onSelect }: {
  readonly label: string
  readonly items: ReadonlyArray<BreadcrumbItem>
  readonly onSelect: (index: number) => void
}) {
  return <nav aria-label={label} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
    {items.map((item, index) => <span className="inline-flex items-center gap-2" key={item.id}>
      {index > 0 ? <span aria-hidden="true">/</span> : null}
      <Button size="sm" variant="ghost" onClick={() => onSelect(index)}>{item.label}</Button>
    </span>)}
  </nav>
}

export function Initials({ children }: { readonly children: string }) {
  return <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">{children}</span>
}
