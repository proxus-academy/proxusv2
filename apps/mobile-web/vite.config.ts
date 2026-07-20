import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export const apiProxyConfig = {
  target: "http://localhost:3000",
  changeOrigin: false,
  rewrite: (path: string) => path.replace(/^\/api/, ""),
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5174,
    proxy: {
      "/api": apiProxyConfig,
    },
  },
})
