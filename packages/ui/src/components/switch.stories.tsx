import type { Meta, StoryObj } from "@storybook/react-vite"
import { Switch } from "./switch.js"

const meta = {
  title: "Formulario/Switch",
  component: Switch,
  tags: ["autodocs"]
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

export const Off: Story = {}
export const On: Story = { args: { defaultChecked: true } }
export const Disabled: Story = { args: { disabled: true } }
