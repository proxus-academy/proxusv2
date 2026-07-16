import type { Meta, StoryObj } from "@storybook/react-vite"
import { Skeleton } from "./skeleton.js"

const meta = {
  title: "Superficies/Skeleton",
  component: Skeleton,
  tags: ["autodocs"]
} satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

export const CardPlaceholder: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-full" />
    </div>
  )
}
