import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

const root = document.getElementById("root")
if (root === null) {
  throw new Error("missing #root")
}

createRoot(root).render(
  <StrictMode>
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Proxus v2 — Web</h1>
      <p>Shell sin lógica ni API todavía.</p>
    </main>
  </StrictMode>
)