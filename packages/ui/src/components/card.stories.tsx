import type { Meta, StoryObj } from "@storybook/react-vite"
import { Button } from "./button.js"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card.js"

const meta = {
  title: "Superficies/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["static", "interactive"] },
    padding: { control: "select", options: ["none", "sm", "default", "lg"] }
  },
  args: { variant: "static", padding: "default" }
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Static: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Anatomía humana</CardTitle>
        <CardDescription>42 preguntas · Dificultad media</CardDescription>
      </CardHeader>
      <CardContent>Repasa los sistemas óseo y muscular antes del examen.</CardContent>
      <CardFooter>
        <Button variant="primary" size="sm">
          Empezar test
        </Button>
      </CardFooter>
    </Card>
  )
}

export const Interactive: Story = {
  args: { variant: "interactive" },
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Card interactiva</CardTitle>
        <CardDescription>Hover para ver la sombra "sticker"</CardDescription>
      </CardHeader>
    </Card>
  )
}
