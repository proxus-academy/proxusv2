import { createFileRoute } from "@tanstack/react-router"
import { PaymentsScreen } from "../../../modules/creator/payments-screen.js"
export const Route = createFileRoute("/ugc/_authenticated/payments")({ component: PaymentsScreen })
