import type { Meta, StoryObj } from "@storybook/react-vite"
import { useArgs } from "storybook/preview-api"
import { Button } from "./button.js"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./dialog.js"

const meta = {
  title: "Overlays/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  argTypes: {
    open: { control: "boolean" }
  },
  args: { open: false as boolean }
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs<typeof meta.args>()
    return (
      <Dialog {...args} onOpenChange={(next) => updateArgs({ open: next })}>
        <DialogTrigger asChild>
          <Button variant="secondary">Abrir diálogo</Button>
        </DialogTrigger>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Confirmar acción</DialogTitle>
            <DialogDescription>
              En móvil (viewport &lt; 825px) se comporta como bottom sheet; en desktop, como modal centrado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => updateArgs({ open: false })}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => updateArgs({ open: false })}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
}
