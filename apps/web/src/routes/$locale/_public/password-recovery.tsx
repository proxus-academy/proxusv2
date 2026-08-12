import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/$locale/_public/password-recovery")({
  component: Outlet,
})
