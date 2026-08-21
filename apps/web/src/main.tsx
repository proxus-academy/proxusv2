import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@proxus/ui/theme.css"
import { webRuntimeInitialValues } from "./runtime-layers.js"
import { RouterProvider } from "./routes/router.js"

const root = document.getElementById("root")
if (root === null) {
  throw new Error("missing #root")
}

const reactRoot = createRoot(root)
reactRoot.render(
  <StrictMode>
    <RegistryProvider initialValues={webRuntimeInitialValues}>
      <RouterProvider />
    </RegistryProvider>
  </StrictMode>,
)

// SAFETY: Vite supplies this optional HMR extension in development builds only.
const hot = (import.meta as ImportMeta & { readonly hot?: { readonly dispose: (cleanup: () => void) => void } }).hot
if (hot !== undefined) hot.dispose(() => reactRoot.unmount())
