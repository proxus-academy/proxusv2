import type { Meta, StoryObj } from "@storybook/react-vite"
import { Label } from "./label.js"
import { RadioGroup, RadioGroupItem } from "./radio-group.js"

const meta = {
  title: "Formulario/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"]
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="medio">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="facil" id="facil" />
        <Label htmlFor="facil">Fácil</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="medio" id="medio" />
        <Label htmlFor="medio">Medio</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="dificil" id="dificil" />
        <Label htmlFor="dificil">Difícil</Label>
      </div>
    </RadioGroup>
  )
}
