import type { Meta, StoryObj } from "@storybook/react-vite"
import { useArgs } from "storybook/preview-api"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js"

const meta = {
  title: "Overlays/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  argTypes: {
    value: { control: "select", options: ["resumen", "detalle"] }
  },
  args: { value: "resumen" }
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => {
    const [{ value }, updateArgs] = useArgs<typeof meta.args>()
    return (
      <Tabs value={value} onValueChange={(next) => updateArgs({ value: next })} className="w-80">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen">Vista resumida del progreso.</TabsContent>
        <TabsContent value="detalle">Vista detallada del progreso.</TabsContent>
      </Tabs>
    )
  }
}
