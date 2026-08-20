import { createFileRoute, Navigate } from "@tanstack/react-router"

export const Route = createFileRoute("/admin/_authenticated/")({ component: () => <Navigate to="/admin/nodes" replace /> })
