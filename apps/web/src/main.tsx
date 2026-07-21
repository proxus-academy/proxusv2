import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"
import { composition } from "./composition.js"
import "./app.css"

const root = document.getElementById("root")
if (root === null) {
  throw new Error("missing #root")
}

const reactRoot = createRoot(root)
reactRoot.render(
  <StrictMode>
    <RegistryProvider>
      <App />
    </RegistryProvider>
  </StrictMode>,
)

const hot = (import.meta as ImportMeta & { readonly hot?: { readonly dispose: (cleanup: () => void) => void } }).hot
if (hot !== undefined) hot.dispose(() => {
  reactRoot.unmount()
  void composition.dispose()
})