import { createFileRoute } from "@tanstack/react-router"
import { VideosScreen } from "../../../modules/creator/videos-screen.js"
export const Route = createFileRoute("/ugc/_authenticated/videos")({ component: VideosScreen })
