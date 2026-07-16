import type { Meta, StoryObj } from "@storybook/react-vite"
import { Heart } from "lucide-react"
import { IconButton } from "./icon-button.js"

const meta = {
  title: "Botones/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "primary", "destructive", "ghost", "destructive-ghost"] },
    size: { control: "select", options: ["sm", "default", "lg"] }
  },
  args: { icon: <Heart className="h-4 w-4" />, title: "Favorito" }
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { variant: "default" } }
export const Primary: Story = { args: { variant: "primary" } }
export const Destructive: Story = { args: { variant: "destructive" } }
export const Ghost: Story = { args: { variant: "ghost" } }
export const Loading: Story = { args: { variant: "primary", loading: true } }
