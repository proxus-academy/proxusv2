import type { Meta, StoryObj } from "@storybook/react-vite"
import { Avatar } from "./avatar.js"

const meta = {
  title: "Datos/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["sm", "default", "lg"] }
  },
  args: { name: "Javier", color: "#793ef9" }
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <Avatar name="Javier" color="#793ef9" size="sm" />
      <Avatar name="Ana" color="#9900a1" size="default" />
      <Avatar name="Marcos" color="#d4af37" size="lg" />
    </div>
  )
}

export const WithDetail: Story = {
  args: {
    detail: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-primary text-[10px] font-bold text-white">
        12
      </div>
    )
  }
}
