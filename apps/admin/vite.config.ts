import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const rootDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDirectory, "src")
    }
  },
  server: {
    port: 5175,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, "")
      },
      "/admin-api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/admin-api/, "")
      }
    }
  }
})
