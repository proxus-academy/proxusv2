import { Network, Users } from "lucide-react"

export const adminNavigation = [
  { id: "nodes", label: "Nodos de estudio", icon: Network },
  { id: "users", label: "Usuarios", icon: Users },
] as const

export type AdminSection = typeof adminNavigation[number]["id"]
