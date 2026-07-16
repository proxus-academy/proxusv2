import type { Meta, StoryObj } from "@storybook/react-vite"
import { Input } from "./input.js"
import { Label } from "./label.js"

const meta = {
  title: "Formulario/Label",
  component: Label,
  tags: ["autodocs"],
  args: { children: "Email", htmlFor: "email" }
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithInput: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input id="email" placeholder="tu@email.com" />
    </div>
  )
}
