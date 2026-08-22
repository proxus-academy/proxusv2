import { createFileRoute } from "@tanstack/react-router"
import { ProfileScreen } from "../../../modules/creator/profile-screen.js"

export const Route = createFileRoute("/ugc/_authenticated/profile")({ component: ProfileScreen })
