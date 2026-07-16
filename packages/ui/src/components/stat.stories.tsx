import type { Meta, StoryObj } from "@storybook/react-vite"
import { Flame } from "lucide-react"
import { Stat } from "./stat.js"

const meta = {
  title: "Datos/Stat",
  component: Stat,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "success", "warning", "danger"] }
  },
  args: { title: "Tests", value: 128 }
} satisfies Meta<typeof Stat>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithTrend: Story = { args: { trend: { value: 12, isPositive: true } } }
export const WithIcon: Story = { args: { icon: <Flame className="h-4 w-4" /> } }
export const Loading: Story = { args: { loading: true } }

export const Grid: Story = {
  render: () => (
    <div className="grid w-96 grid-cols-2 gap-3">
      <Stat title="Tests" value={128} trend={{ value: 12, isPositive: true }} />
      <Stat title="Racha" value="7 días" description="Récord: 21 días" />
      <Stat title="Errores" value={4} variant="danger" trend={{ value: 8, isPositive: false }} />
      <Stat title="Aciertos" value="94%" variant="success" />
    </div>
  )
}
