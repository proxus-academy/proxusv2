import type { Meta, StoryObj } from "@storybook/react-vite"
import { Checkbox } from "./checkbox.js"
import { Label } from "./label.js"

const meta = {
  title: "Formulario/Checkbox",
  component: Checkbox,
  tags: ["autodocs"]
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Checked: Story = { args: { defaultChecked: true } }
export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Acepto los términos</Label>
    </div>
  )
}
