import type { Meta, StoryObj } from "@storybook/react-vite"
import { useArgs } from "storybook/preview-api"
import { Pagination } from "./pagination.js"

const meta = {
  title: "Botones/Pagination",
  component: Pagination,
  tags: ["autodocs"],
  argTypes: {
    page: { control: "number" },
    pageCount: { control: "number" },
    siblingCount: { control: "number" },
    className: { control: "text" },
    onPageChange: { control: false }
  },
  args: { page: 4, pageCount: 12, siblingCount: 1, onPageChange: () => {} }
} satisfies Meta<typeof Pagination>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs<typeof meta.args>()
    return <Pagination {...args} onPageChange={(next) => updateArgs({ page: next })} />
  }
}
