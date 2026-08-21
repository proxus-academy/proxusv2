import { createFileRoute } from "@tanstack/react-router"
import { AiOperationsScreen } from "../../../modules/ai-operations/ai-operations-screen.js"

export const Route = createFileRoute("/admin/_authenticated/ai-operations")({ component: AiOperationsScreen })
