import type { Meta, StoryObj } from "@storybook/react-vite"
import { Text } from "./typography.js"

const meta = {
  title: "Tipografía/Text",
  component: Text,
  tags: ["autodocs"],
  args: { children: "Texto de ejemplo", size: "default", tone: "default", weight: "normal" }
} satisfies Meta<typeof Text>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const AllTones: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <Text>Texto por defecto</Text>
      <Text tone="muted">Texto muted</Text>
      <Text tone="primary">Texto primary</Text>
      <Text tone="destructive">Texto destructive</Text>
      <Text weight="bold">Texto bold</Text>
      <Text size="sm" tone="muted">
        Texto pequeño
      </Text>
    </div>
  )
}
