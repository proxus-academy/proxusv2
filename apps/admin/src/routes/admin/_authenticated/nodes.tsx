import { createFileRoute } from "@tanstack/react-router"
import { StudyCatalogScreen } from "../../../modules/study-catalog/index.js"
import { useAdminPermissions } from "../../../modules/auth/layouts.js"

function NodesRoute() {
  return <StudyCatalogScreen permissions={useAdminPermissions()} />
}

export const Route = createFileRoute("/admin/_authenticated/nodes")({ component: NodesRoute })
