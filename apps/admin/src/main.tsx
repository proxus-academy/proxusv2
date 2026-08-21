import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@proxus/ui/theme.css"

import { RouterProvider } from "./routes/router.js"

const root = document.getElementById("root")

if (root === null) {
  throw new Error("No se encontró el elemento raíz de la aplicación")
}

const reactRoot = createRoot(root)
reactRoot.render(
  <StrictMode>
    <RegistryProvider>
      <RouterProvider />
    </RegistryProvider>
  </StrictMode>,
)

// SAFETY: Vite supplies this optional HMR extension in development builds only.
const hot = (import.meta as ImportMeta & { readonly hot?: { readonly dispose: (cleanup: () => void) => void } }).hot
if (hot !== undefined) hot.dispose(() => reactRoot.unmount())
