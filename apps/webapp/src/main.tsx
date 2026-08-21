import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { makeWebappConfig } from "./config.js"
import { webRuntimeInitialValues } from "./runtime-layers.js"
import { RouterProvider } from "./routes/router.js"
import "./app.css"

makeWebappConfig({
  VITE_WEB_URL: import.meta.env.VITE_WEB_URL,
  VITE_ASSET_BASE_URL: import.meta.env.VITE_ASSET_BASE_URL,
}, import.meta.env.PROD)

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
