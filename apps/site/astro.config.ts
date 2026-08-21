import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import { paraglideVitePlugin } from "@inlang/paraglide-js"

export default defineConfig({
  site: "https://proxus.app",
  output: "static",
  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [sitemap()],
  build: {
    assets: "assets",
  },
  vite: {
    plugins: [
      paraglideVitePlugin({
        project: "../../project.inlang",
        outdir: "./src/paraglide",
        emitTsDeclarations: true,
        strategy: ["url", "globalVariable", "baseLocale"],
      }),
    ],
    server: {
      allowedHosts: ["javi-remote-work.tail11debb.ts.net"],
    },
  },
})
