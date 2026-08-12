import { Activity, Network } from "lucide-react"
export const adminNavigation = [
  { id: "catalog", label: "Nodos de estudio", icon: Network },
  { id: "runs", label: "Agent runs", icon: Activity },
] as const
export type AdminSection = typeof adminNavigation[number]["id"]
