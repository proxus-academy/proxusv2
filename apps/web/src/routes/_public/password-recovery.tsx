import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/password-recovery")({
  component: Outlet,
})
