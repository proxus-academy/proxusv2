import { createFileRoute } from "@tanstack/react-router"
import { LoginScreen } from "../../../modules/auth/login-screen.js"
export const Route = createFileRoute("/ugc/_public/login")({ component: LoginScreen })
