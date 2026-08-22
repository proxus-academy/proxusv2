import { createFileRoute } from "@tanstack/react-router"
import { UgcManagementScreen } from "../../../modules/ugc-management/ugc-management-screen.js"
export const Route = createFileRoute("/admin/_authenticated/ugc")({ component: UgcManagementScreen })
