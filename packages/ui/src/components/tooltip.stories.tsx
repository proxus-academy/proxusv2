import type { Meta, StoryObj } from "@storybook/react-vite"
import { IconButton } from "./icon-button.js"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.js"
import { Info } from "lucide-react"

const meta = {
  title: "Overlays/Tooltip",
  component: Tooltip,
  tags: ["autodocs"]
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <IconButton icon={<Info className="h-4 w-4" />} title="Info" variant="ghost" />
        </TooltipTrigger>
        <TooltipContent>Número de preguntas extra disponibles</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
