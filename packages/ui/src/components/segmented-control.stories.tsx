import type { Meta, StoryObj } from "@storybook/react-vite"
import { useArgs } from "storybook/preview-api"
import { SegmentedControl } from "./segmented-control.js"

const meta = {
  title: "Formulario/SegmentedControl",
  component: SegmentedControl,
  tags: ["autodocs"],
  argTypes: {
    value: { control: "select", options: ["dia", "semana", "mes"] },
    options: { control: "object" },
    className: { control: "text" },
    onChange: { control: false }
  },
  args: {
    value: "semana",
    onChange: () => {},
    options: [
      { value: "dia", label: "Día" },
      { value: "semana", label: "Semana" },
      { value: "mes", label: "Mes" }
    ]
  }
} satisfies Meta<typeof SegmentedControl>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs<typeof meta.args>()
    return <SegmentedControl {...args} onChange={(next) => updateArgs({ value: next })} />
  }
}
