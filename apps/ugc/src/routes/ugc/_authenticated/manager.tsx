import { createFileRoute } from "@tanstack/react-router"
import { ManagerScreen } from "../../../modules/manager/manager-screen.js"
export const Route = createFileRoute("/ugc/_authenticated/manager")({ component: ManagerScreen })
