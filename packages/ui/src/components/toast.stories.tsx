import type { Meta, StoryObj } from "@storybook/react-vite"
import { useArgs } from "storybook/preview-api"
import { Toast, ToastCloseButton, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast.js"

const meta = {
  title: "Overlays/Toast",
  component: Toast,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "success", "destructive"] },
    open: { control: "boolean" }
  },
  args: { open: true as boolean, variant: "default" }
} satisfies Meta<typeof Toast>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => {
    const [{ open, variant }, updateArgs] = useArgs<typeof meta.args>()
    return (
      <ToastProvider>
        <Toast open={open} variant={variant} onOpenChange={(next) => updateArgs({ open: next })} className="static w-80">
          <div>
            <ToastTitle>Guardado</ToastTitle>
            <ToastDescription>Tus cambios se guardaron correctamente.</ToastDescription>
          </div>
          <ToastCloseButton />
        </Toast>
        <ToastViewport className="static" />
      </ToastProvider>
    )
  }
}

export const AllVariants: Story = {
  render: () => (
    <ToastProvider>
      <div className="group relative flex w-80 flex-col gap-3">
        <Toast open variant="default" className="static">
          <div>
            <ToastTitle>Guardado</ToastTitle>
            <ToastDescription>Tus cambios se guardaron correctamente.</ToastDescription>
          </div>
          <ToastCloseButton />
        </Toast>
        <Toast open variant="success" className="static">
          <div>
            <ToastTitle>¡Racha de 7 días!</ToastTitle>
            <ToastDescription>Sigue así para desbloquear la insignia dorada.</ToastDescription>
          </div>
          <ToastCloseButton />
        </Toast>
        <Toast open variant="destructive" className="static">
          <div>
            <ToastTitle>Error al enviar</ToastTitle>
            <ToastDescription>Revisa tu conexión e inténtalo de nuevo.</ToastDescription>
          </div>
          <ToastCloseButton />
        </Toast>
      </div>
      <ToastViewport className="static" />
    </ToastProvider>
  )
}
