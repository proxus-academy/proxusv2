import type { Meta, StoryObj } from "@storybook/react-vite"
import { Heading } from "./typography.js"

const meta = {
  title: "Tipografía/Heading",
  component: Heading,
  tags: ["autodocs"],
  args: { children: "Heading", level: 2 }
} satisfies Meta<typeof Heading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const AllLevels: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Heading level={1}>Heading 1</Heading>
      <Heading level={2}>Heading 2</Heading>
      <Heading level={3}>Heading 3</Heading>
      <Heading level={4}>Heading 4</Heading>
    </div>
  )
}
