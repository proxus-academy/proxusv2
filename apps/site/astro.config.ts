import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"

export default defineConfig({
  site: "https://proxus.app",
  output: "static",
  integrations: [sitemap()],
  build: {
    assets: "assets",
  },
  vite: {
    server: {
      allowedHosts: ["javi-remote-work.tail11debb.ts.net"],
    },
  },
})
