import type { Meta, StoryObj } from "@storybook/react-vite"
import { Textarea } from "./textarea.js"

const meta = {
  title: "Formulario/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: { placeholder: "Escribe tu respuesta..." }
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
