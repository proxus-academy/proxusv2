import * as React from "react"
import { cn } from "../lib/cn.js"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Si true (por defecto), crece verticalmente con el contenido en vez de permitir arrastrar el borde. */
  autosize?: boolean
}

function resize(el: HTMLTextAreaElement) {
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight}px`
}

export function Textarea({
  className,
  autosize = true,
  onInput,
  rows = 3,
  ref,
  ...props
}: TextareaProps & { ref?: React.Ref<HTMLTextAreaElement> }) {
  const internalRef = React.useRef<HTMLTextAreaElement>(null)

  React.useLayoutEffect(() => {
    if (autosize && internalRef.current !== null) resize(internalRef.current)
  }, [autosize, props.value])

  return (
    <textarea
      ref={(el) => {
        internalRef.current = el
        if (typeof ref === "function") ref(el)
        else if (ref !== undefined && ref !== null) ref.current = el
      }}
      rows={rows}
      onInput={(e) => {
        if (autosize) resize(e.currentTarget)
        onInput?.(e)
      }}
      className={cn(
        "flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
        autosize ? "overflow-hidden" : "min-h-20",
        className
      )}
      {...props}
    />
  )
}
