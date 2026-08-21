import type { ReactNode } from "react"
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "./sidebar.js"
import { TooltipProvider } from "./tooltip.js"

export interface AdminNavigationItem {
  readonly key: string
  readonly label: string
  readonly link: ReactNode
  readonly active: boolean
}

export function AdminShell({ navigation, children }: { readonly navigation: ReadonlyArray<AdminNavigationItem>; readonly children: ReactNode }) {
  return <TooltipProvider>
    <SidebarProvider className="admin-shell [--sidebar-width:18rem]">
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="h-20 justify-center border-b px-5">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">P</span><div className="leading-tight"><span className="block text-sm font-bold tracking-[0.12em]">PROXUS</span><span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Admin</span></div></div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-4"><SidebarGroup><SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-wider">Datos</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          {navigation.map((item) => <SidebarMenuItem key={item.key}><SidebarMenuButton asChild isActive={item.active} tooltip={item.label} className="font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">{item.link}</SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      </Sidebar>
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center border-b px-4 md:hidden"><SidebarTrigger /><span className="ml-3 text-sm font-semibold">Proxus Admin</span></header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  </TooltipProvider>
}
