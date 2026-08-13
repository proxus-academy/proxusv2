import type { Meta, StoryObj } from "@storybook/react-vite"
import { useArgs } from "storybook/preview-api"
import { Combobox, type ComboboxProps } from "./combobox.js"

const CARRERAS = [
  { value: "medicina", label: "Medicina" },
  { value: "derecho", label: "Derecho" },
  { value: "enfermeria", label: "Enfermería" },
  { value: "psicologia", label: "Psicología" },
  { value: "arquitectura", label: "Arquitectura" }
]

const meta = {
  title: "Formulario/Combobox",
  component: Combobox,
  tags: ["autodocs"],
  argTypes: {
    value: { control: "select", options: CARRERAS.map((option) => option.value) },
    options: { control: "object" },
    onChange: { control: false },
    onCreateOption: { control: false },
    placeholder: { control: "text" },
    searchPlaceholder: { control: "text" },
    mode: { control: "select", options: ["normal", "searchable", "creatable"] },
    disabled: { control: "boolean" },
    className: { control: "text" }
  },
  args: {
    // SAFETY: The surrounding typed contract establishes the asserted representation.
    value: "medicina" as string | null,
    onChange: () => {},
    options: CARRERAS,
    placeholder: "Seleccionar una opción",
    searchPlaceholder: "Buscar...",
    mode: "searchable" as const,
    disabled: false,
    className: "w-72"
  }
} satisfies Meta<typeof Combobox>

export default meta
type Story = StoryObj<typeof meta>

// onCreateOption se pasa siempre (no solo en la story Creatable): el propio componente
// oculta el botón "Crear" salvo que mode="creatable", así que el control de Controls
// funciona en vivo sin necesitar una story aparte para probarlo.
// (Función auxiliar sin hooks propios: useArgs() debe llamarse directamente dentro de cada
// `render`, nunca en un componente React anidado, o Storybook pierde el contexto del hook.)
function renderCombobox(args: ComboboxProps, updateArgs: (next: Partial<typeof meta.args>) => void) {
  return (
    <Combobox
      {...args}
      onChange={(next) => updateArgs({ value: next })}
      onCreateOption={(label) => {
        const newOption = { value: label.toLowerCase(), label }
        updateArgs({ options: [...args.options, newOption], value: newOption.value })
      }}
    />
  )
}

export const Default: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs<typeof meta.args>()
    return renderCombobox(args, updateArgs)
  }
}

export const Creatable: Story = {
  args: { mode: "creatable", value: null },
  render: (args) => {
    const [, updateArgs] = useArgs<typeof meta.args>()
    return renderCombobox(args, updateArgs)
  }
}
