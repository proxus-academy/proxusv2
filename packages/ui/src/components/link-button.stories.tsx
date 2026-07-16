import type { Meta, StoryObj } from "@storybook/react-vite"
import { LinkButton } from "./link-button.js"

const meta = {
  title: "Botones/LinkButton",
  component: LinkButton,
  tags: ["autodocs"],
  args: { children: "¿Olvidaste tu contraseña?", href: "#" }
} satisfies Meta<typeof LinkButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
