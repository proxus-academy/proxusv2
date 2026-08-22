import { createFileRoute } from "@tanstack/react-router"
import { CreatorHomeScreen } from "../../../modules/creator/home-screen.js"
export const Route = createFileRoute("/ugc/_authenticated/")({ component: CreatorHomeScreen })
