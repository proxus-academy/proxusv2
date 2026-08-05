import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": sourceDirectory
    }
  },
  server: {
    port: 5175,
    allowedHosts: ["javi-remote-work.tail11debb.ts.net"],
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, "")
      },
      "/admin-api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/admin-api/, "")
      }
    }
  }
})
