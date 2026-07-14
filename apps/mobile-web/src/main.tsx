import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

const root = document.getElementById("root")
if (root === null) {
  throw new Error("missing #root")
}

createRoot(root).render(
  <StrictMode>
    <main style={{ fontFamily: "system-ui", padding: "1.25rem", maxWidth: "28rem", margin: "0 auto" }}>
      <h1>Proxus v2 — Mobile Web</h1>
      <p>Shell PWA (sin service worker ni API todavía).</p>
    </main>
  </StrictMode>
)