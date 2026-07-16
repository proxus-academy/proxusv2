import type { Meta, StoryObj } from "@storybook/react-vite"
import { Mail } from "lucide-react"
import { Input } from "./input.js"

const meta = {
  title: "Formulario/Input",
  component: Input,
  tags: ["autodocs"],
  argTypes: {
    iconPosition: { control: "select", options: ["left", "right"] }
  },
  args: { placeholder: "tu@email.com" }
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithIcon: Story = { args: { icon: <Mail className="h-4 w-4" /> } }
export const Disabled: Story = { args: { disabled: true, value: "no editable" } }
