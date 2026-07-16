import type { Meta, StoryObj } from "@storybook/react-vite"
import { ChoiceCard } from "./choice-card.js"

const meta = {
  title: "Formulario/ChoiceCard",
  component: ChoiceCard,
  tags: ["autodocs"],
  args: {
    title: "España",
    description: "Selecciona dónde estudias",
    leading: "🇪🇸",
  },
} satisfies Meta<typeof ChoiceCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Selected: Story = { args: { selected: true } }
export const Disabled: Story = { args: { disabled: true } }
