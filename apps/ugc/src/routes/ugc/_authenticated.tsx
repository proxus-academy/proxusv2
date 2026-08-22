import { createFileRoute } from "@tanstack/react-router"
import { AuthenticatedLayout } from "../../modules/auth/layouts.js"
export const Route = createFileRoute("/ugc/_authenticated")({ component: AuthenticatedLayout })
