import type { ReactNode } from "react"
import { Link, useMatchRoute } from "@tanstack/react-router"
import { AdminShell } from "@proxus/ui/admin"
import { adminNavigation } from "./navigation.js"

export function AdminLayout({ children }: { readonly children: ReactNode }) {
  const matchRoute = useMatchRoute()
  const navigation = adminNavigation.map(({ to, label, icon: Icon }) => ({
    key: to,
    label,
    link: <Link to={to}><Icon aria-hidden="true" />{label}</Link>,
    active: matchRoute({ to, fuzzy: true }) !== false,
  }))
  return <AdminShell navigation={navigation}>{children}</AdminShell>
}
