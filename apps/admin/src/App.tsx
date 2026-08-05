import { AdminLayout } from "@/app/admin-layout"
import { StudyCatalogScreen } from "@/modules/study-catalog"
import { AdminGuard } from "@/modules/auth/admin-guard"
import { UsersScreen } from "@/modules/users/users"
import { useState } from "react"
import type { AdminSection } from "@/app/navigation"

export function App() {
  const [section, setSection] = useState<AdminSection>("nodes")
  return <AdminGuard>{(permissions) => (
    <AdminLayout activeSection={section} onNavigate={setSection}>
      {section === "nodes" ? <StudyCatalogScreen permissions={permissions} /> : <UsersScreen />}
    </AdminLayout>
  )}</AdminGuard>
}
