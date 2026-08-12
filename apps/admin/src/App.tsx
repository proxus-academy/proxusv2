import { useState } from "react"
import { AdminLayout } from "@/app/admin-layout"
import type { AdminSection } from "@/app/navigation"
import { StudyCatalogScreen } from "@/modules/study-catalog"
import { AgentRunsScreen } from "@/modules/agent-runs/agent-runs-screen"

export function App() {
  const [section, setSection] = useState<AdminSection>("catalog")
  const [runId, setRunId] = useState<string>()
  const navigate = (next: AdminSection) => { setSection(next); setRunId(undefined) }
  return <AdminLayout section={section} onNavigate={navigate}>{section === "catalog" ? <StudyCatalogScreen /> : <AgentRunsScreen selectedRunId={runId} onSelectRun={setRunId} />}</AdminLayout>
}
