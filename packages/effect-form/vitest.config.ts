import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"
export default defineConfig({ plugins: [react()], test: { include: ["test/**/*.test.ts", "test-react/**/*.test.tsx"], environment: "happy-dom", setupFiles: ["./vitest-setup.ts"] } })
