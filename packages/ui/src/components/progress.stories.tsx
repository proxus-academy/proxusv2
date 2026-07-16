import type { Meta, StoryObj } from "@storybook/react-vite"
import { Progress } from "./progress.js"

const meta = {
  title: "Overlays/Progress",
  component: Progress,
  tags: ["autodocs"],
  args: { value: 60 }
} satisfies Meta<typeof Progress>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <Progress {...args} className="w-72" />
}
