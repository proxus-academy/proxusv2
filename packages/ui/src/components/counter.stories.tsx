import type { Meta, StoryObj } from "@storybook/react-vite"
import { Coins } from "lucide-react"
import { Counter } from "./counter.js"

const meta = {
  title: "Datos/Counter",
  component: Counter,
  tags: ["autodocs"],
  args: { value: 240, icon: <Coins className="h-5 w-5 text-amber-500" />, label: "Coins" }
} satisfies Meta<typeof Counter>

export default meta
type Story = StoryObj<typeof meta>

export const Static: Story = {}
export const Clickable: Story = { args: { onClick: () => {} } }
export const Small: Story = { args: { size: "sm" } }
