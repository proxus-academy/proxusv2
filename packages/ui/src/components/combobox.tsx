import { Check, ChevronDown, Plus, Search } from "lucide-react"
import { Popover } from "radix-ui"
import * as React from "react"
import { cn } from "../lib/cn.js"

export interface ComboboxOption {
  value: string
  label: string
  icon?: React.ReactNode
}

/**
 * "creatable" implica "searchable" (hay que escribir para crear una opción nueva), así que
 * no son dos booleanos independientes: es un único modo con 3 estados válidos.
 */
export type ComboboxMode = "normal" | "searchable" | "creatable"

export interface ComboboxProps {
  options: ReadonlyArray<ComboboxOption>
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  mode?: ComboboxMode
  onCreateOption?: (value: string) => void
  disabled?: boolean
  className?: string
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Seleccionar una opción",
  searchPlaceholder = "Buscar...",
  mode = "searchable",
  onCreateOption,
  disabled = false,
  className
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const searchable = mode !== "normal"
  const creatable = mode === "creatable"

  const selected = options.find((option) => option.value === value) ?? null
  const filtered =
    search.trim() === "" ? options : options.filter((option) => normalize(option.label).includes(normalize(search)))

  const exactMatch = options.some((option) => normalize(option.label) === normalize(search))
  const canCreate = creatable && search.trim() !== "" && !exactMatch

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSearch("")
  }

  function handleSelect(option: ComboboxOption) {
    onChange(option.value)
    handleOpenChange(false)
  }

  function handleCreate() {
    onCreateOption?.(search.trim())
    handleOpenChange(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg bg-background px-4 py-2 text-left text-sm transition-all",
            open ? "ring-2 ring-primary/20" : "ring-1 ring-input hover:ring-gray-300",
            disabled ? "cursor-not-allowed bg-muted opacity-50" : "cursor-pointer",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selected?.icon}
            <span className={cn("truncate", selected === null && "text-muted-foreground")}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className={cn(
            "z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover shadow-lg",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
          )}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
              <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {canCreate && onCreateOption !== undefined && (
                <button
                  type="button"
                  onClick={handleCreate}
                  className="flex flex-shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Crear
                </button>
              )}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length > 0 ? (
              filtered.map((option) => {
                const isSelected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={cn(
                      "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors",
                      isSelected ? "bg-primary/5 font-medium text-primary" : "text-foreground hover:bg-accent"
                    )}
                  >
                    {option.icon}
                    <span className="flex-1 truncate">{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 flex-shrink-0" />}
                  </button>
                )
              })
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No se encontraron resultados</p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
