import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"
import "./app.css"

const root = document.getElementById("root")

if (root === null) {
  throw new Error("No se encontró el elemento raíz de la aplicación")
}

createRoot(root).render(
  <StrictMode>
    <RegistryProvider>
      <App />
    </RegistryProvider>
  </StrictMode>
)
