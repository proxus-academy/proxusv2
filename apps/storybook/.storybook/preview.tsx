import type { Preview } from "@storybook/react-vite"
import "../src/storybook.css"

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "app",
      values: [{ name: "app", value: "#f7f7fe" }],
    },
    a11y: {
      test: "todo",
    },
    controls: {
      exclude: ["ref"],
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
