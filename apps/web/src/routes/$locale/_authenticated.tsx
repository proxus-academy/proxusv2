import { createFileRoute } from "@tanstack/react-router"
import { AuthenticatedLayout } from "../../modules/auth/layouts.js"

export const Route = createFileRoute("/$locale/_authenticated")({
  component: AuthenticatedLayout,
})
