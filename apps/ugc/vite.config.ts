import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/ugc/",
  plugins: [
    TanStackRouterVite({ routeFileIgnorePattern: "(?:router|.*\\.test)\\.[jt]sx?$" }),
    tailwindcss(),
    react(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5176,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false, rewrite: (path) => path.replace(/^\/api/, "") } },
  },
})
