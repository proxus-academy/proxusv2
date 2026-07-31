import type { Meta, StoryObj } from "@storybook/react-vite"
import { Button } from "./button.js"
import { EmptyState } from "./empty-state.js"

const meta = { title: "Components/EmptyState", component: EmptyState } satisfies Meta<typeof EmptyState>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: "No hay resultados",
    description: "Prueba con otra búsqueda.",
    action: <Button>Limpiar búsqueda</Button>,
  },
}
