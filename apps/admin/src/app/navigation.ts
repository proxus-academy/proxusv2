import { Network, Users, UsersRound } from "lucide-react"

export const adminNavigation = [
  { to: "/admin/nodes", label: "Nodos de estudio", icon: Network },
  { to: "/admin/users", label: "Usuarios", icon: Users },
  { to: "/admin/ugc", label: "UGC", icon: UsersRound },
] as const
