import tailwindcss from "@tailwindcss/vite"
import type { StorybookConfig } from "@storybook/react-vite"
const config: StorybookConfig = {
  stories: [
    "../../../packages/ui/src/**/*.mdx",
    "../../../packages/ui/src/**/*.stories.@(ts|tsx)",
    "../../web/src/**/*.mdx",
    "../../web/src/**/*.stories.@(ts|tsx)",
    "../../mobile-web/src/**/*.mdx",
    "../../mobile-web/src/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (viteConfig) => {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()]
    viteConfig.resolve = {
      ...viteConfig.resolve,
      dedupe: [
        ...((viteConfig.resolve?.dedupe as ReadonlyArray<string> | undefined) ?? []),
        "react",
        "react-dom",
        "effect",
        "@effect/atom-react",
      ],
    }
    return viteConfig
  },
}

export default config
