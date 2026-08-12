import { createFileRoute } from "@tanstack/react-router"
import { UsersScreen } from "../../../modules/users/users.js"

export const Route = createFileRoute("/admin/_authenticated/users")({ component: UsersScreen })
