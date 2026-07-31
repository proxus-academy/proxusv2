import * as React from "react"
import { cn } from "../lib/cn.js"

export interface OtpInputProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onComplete?: (value: string) => void
  readonly length?: number
  readonly disabled?: boolean
  readonly loading?: boolean
  readonly name?: string
  readonly label?: string
  readonly className?: string
}

const digitsOnly = (value: string) => value.replace(/\D/g, "")

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  loading = false,
  name = "code",
  label = "Código de verificación",
  className,
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([])
  const completedRef = React.useRef("")
  const digits = digitsOnly(value).slice(0, length)

  const update = (next: string) => {
    const normalized = digitsOnly(next).slice(0, length)
    onChange(normalized)
    if (normalized.length === length && completedRef.current !== normalized) {
      completedRef.current = normalized
      onComplete?.(normalized)
    } else if (normalized.length < length) {
      completedRef.current = ""
    }
  }

  return (
    <fieldset className={cn("space-y-2", className)} disabled={disabled || loading}>
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <input type="hidden" name={name} value={digits} />
      <div className="flex gap-2" aria-busy={loading || undefined}>
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(element) => { refs.current[index] = element }}
            aria-label={`${label}, dígito ${index + 1} de ${length}`}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            className="h-12 w-11 rounded-lg border-2 border-border bg-background text-center text-lg font-semibold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            inputMode="numeric"
            maxLength={length}
            pattern="[0-9]*"
            value={digits[index] ?? ""}
            onChange={(event) => {
              const inserted = digitsOnly(event.currentTarget.value)
              const next = `${digits.slice(0, index)}${inserted}${digits.slice(index + 1)}`
              update(next)
              refs.current[Math.min(index + Math.max(inserted.length, 1), length - 1)]?.focus()
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && (digits[index] ?? "") === "" && index > 0) {
                event.preventDefault()
                update(`${digits.slice(0, index - 1)}${digits.slice(index)}`)
                refs.current[index - 1]?.focus()
              }
              if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus()
              if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus()
            }}
            onPaste={(event) => {
              event.preventDefault()
              const pasted = digitsOnly(event.clipboardData.getData("text"))
              if (pasted === "") return
              update(`${digits.slice(0, index)}${pasted}${digits.slice(index + pasted.length)}`)
              refs.current[Math.min(index + pasted.length, length - 1)]?.focus()
            }}
          />
        ))}
      </div>
    </fieldset>
  )
}
