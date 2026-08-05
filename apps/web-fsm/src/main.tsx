import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ConnectedApp } from "./app/connected-app.js"
import { initialAppModel } from "./app/update.js"
import { makeAppAtoms } from "./app/runtime.js"
import { parseAppRoute } from "./app/route.js"
import { browserEnvironment } from "./platform/browser.js"
import "./styles.css"

const root = document.getElementById("root")
if (root === null) throw new Error("missing #root")

const atoms = makeAppAtoms(initialAppModel(parseAppRoute(window.location)), browserEnvironment)
const reactRoot = createRoot(root)
reactRoot.render(<StrictMode><RegistryProvider><ConnectedApp atoms={atoms} /></RegistryProvider></StrictMode>)

const hot = (import.meta as ImportMeta & { readonly hot?: { readonly dispose: (cleanup: () => void) => void } }).hot
if (hot !== undefined) hot.dispose(() => reactRoot.unmount())
