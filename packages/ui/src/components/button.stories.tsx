import type { Meta, StoryObj } from "@storybook/react-vite"
import { Sparkles } from "lucide-react"
import { Button } from "./button.js"

const meta = {
  title: "Botones/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "soft", "outline", "ghost", "link", "destructive", "destructive-soft"]
    },
    size: { control: "select", options: ["sm", "default", "lg", "icon", "icon-sm", "icon-lg"] }
  },
  args: { children: "Botón" }
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { variant: "primary" } }
export const Secondary: Story = { args: { variant: "secondary" } }
export const Soft: Story = { args: { variant: "soft" } }
export const Outline: Story = { args: { variant: "outline" } }
export const Ghost: Story = { args: { variant: "ghost" } }
export const Link: Story = { args: { variant: "link" } }
export const Destructive: Story = { args: { variant: "destructive" } }
export const Loading: Story = { args: { variant: "primary", loading: true } }
export const WithIcon: Story = { args: { variant: "primary", icon: <Sparkles className="h-4 w-4" /> } }

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="soft">Soft</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="destructive-soft">Destructive soft</Button>
    </div>
  )
}
