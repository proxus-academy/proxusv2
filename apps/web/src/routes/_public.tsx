import { createFileRoute } from "@tanstack/react-router"
import { PublicOnlyLayout } from "../modules/auth/layouts.js"

export const Route = createFileRoute("/_public")({
  component: PublicOnlyLayout,
})
