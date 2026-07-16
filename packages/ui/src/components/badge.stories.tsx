import type { Meta, StoryObj } from "@storybook/react-vite"
import { Badge } from "./badge.js"

const meta = {
  title: "Datos/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "primary", "success", "warning", "danger", "outline"] },
    size: { control: "select", options: ["sm", "default", "lg"] }
  },
  args: { children: "Badge" }
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { variant: "primary" } }

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="primary">Nuevo</Badge>
      <Badge variant="success">Activo</Badge>
      <Badge variant="warning">Pendiente</Badge>
      <Badge variant="danger">Error</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  )
}

export const Removable: Story = {
  args: { variant: "primary", removable: true, children: "Filtro" }
}
