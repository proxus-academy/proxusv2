import type { Meta, StoryObj } from "@storybook/react-vite"
import { Sparkles } from "lucide-react"
import { Chip } from "./chip.js"

const meta = {
  title: "Datos/Chip",
  component: Chip,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["neutral", "primary", "gold"] },
    size: { control: "select", options: ["sm", "default"] }
  },
  args: { variant: "primary", children: "SuperMagIA", icon: <Sparkles className="h-4 w-4" /> }
} satisfies Meta<typeof Chip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip variant="neutral">Neutral</Chip>
      <Chip variant="primary" icon={<Sparkles className="h-4 w-4" />}>
        SuperMagIA
      </Chip>
      <Chip variant="gold">7 días</Chip>
    </div>
  )
}
