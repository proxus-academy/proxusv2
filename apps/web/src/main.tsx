import { RegistryProvider, useAtomValue } from "@effect/atom-react"
import { FormMessagesProvider } from "@proxus/frontend-web/form"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"
import { webRuntimeInitialValues } from "./runtime-layers.js"
import { disposePublicRouter, messagesCatalogAtom } from "./routes/public-router.js"
import "./app.css"

const root = document.getElementById("root")
if (root === null) {
  throw new Error("missing #root")
}

function LocalizedApp() {
  const messages = useAtomValue(messagesCatalogAtom)
  return <FormMessagesProvider value={messages}><App /></FormMessagesProvider>
}

const reactRoot = createRoot(root)
reactRoot.render(
  <StrictMode>
    <RegistryProvider initialValues={webRuntimeInitialValues}>
      <LocalizedApp />
    </RegistryProvider>
  </StrictMode>,
)

const hot = (import.meta as ImportMeta & { readonly hot?: { readonly dispose: (cleanup: () => void) => void } }).hot
if (hot !== undefined) hot.dispose(() => {
  reactRoot.unmount()
  void disposePublicRouter()
})