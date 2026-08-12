import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import { defineConfig } from "vite"

export const apiProxyConfig = {
  target: "http://localhost:3000",
  changeOrigin: false,
  rewrite: (path: string) => path.replace(/^\/api/, ""),
}

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routeFileIgnorePrefix: "-",
      routeFileIgnorePattern: "(?:router|navigation(?:-runtime)?|.*\\.test)\\.[jt]sx?$",
    }),
    tailwindcss(),
    react(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["javi-remote-work.tail11debb.ts.net"],
    proxy: {
      "/api": apiProxyConfig
    }
  }
})
