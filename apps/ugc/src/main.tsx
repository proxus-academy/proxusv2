import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "./routes/router.js"
import { ugcRuntimeInitialValues } from "./runtime.js"
import "./app.css"

const root = document.getElementById("root")
if (root === null) throw new Error("missing #root")
const reactRoot = createRoot(root)
reactRoot.render(<StrictMode><RegistryProvider initialValues={ugcRuntimeInitialValues}><RouterProvider /></RegistryProvider></StrictMode>)

const hot = import.meta.hot
if (hot !== undefined) hot.dispose(() => reactRoot.unmount())
