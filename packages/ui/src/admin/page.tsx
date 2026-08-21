import type { ReactNode } from "react"

export function AdminPage({ id, title, description, icon, actions, children }: {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly icon: ReactNode
  readonly actions?: ReactNode
  readonly children: ReactNode
}) {
  return <main id={id} className="flex min-h-0 flex-1 p-4 md:p-6"><div className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col gap-6">
    <header className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span><div><h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div>{actions === undefined ? null : <div className="ml-auto">{actions}</div>}</header>
    {children}
  </div></main>
}

export function AdminSplitView({ sidebar, detail, sidebarWidth = "default" }: { readonly sidebar: ReactNode; readonly detail: ReactNode; readonly sidebarWidth?: "default" | "wide" }) {
  return <div className={sidebarWidth === "wide" ? "grid min-h-0 flex-1 gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]" : "grid min-h-0 flex-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-1"}>{sidebar}{detail}</div>
}
