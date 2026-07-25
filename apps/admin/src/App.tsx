import { AdminLayout } from "@/app/admin-layout"
import { StudyCatalogScreen } from "@/modules/study-catalog"
import { AdminGuard } from "@/modules/auth/admin-guard"

export function App() {
  return <AdminGuard>{(permissions) => (
    <AdminLayout><StudyCatalogScreen permissions={permissions} /></AdminLayout>
  )}</AdminGuard>
}
