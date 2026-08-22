import { createFileRoute } from "@tanstack/react-router"
import { PublicOnlyLayout } from "../../modules/auth/layouts.js"
export const Route = createFileRoute("/ugc/_public")({ component: PublicOnlyLayout })
