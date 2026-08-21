import { Activity, Network, Users } from "lucide-react"

export const adminNavigation = [
  { to: "/admin/nodes", label: "Nodos de estudio", icon: Network },
  { to: "/admin/users", label: "Usuarios", icon: Users },
  { to: "/admin/ai-operations", label: "Operaciones IA", icon: Activity },
] as const
