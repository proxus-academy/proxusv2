import * as React from "react"
import { cn } from "../lib/cn.js"

export interface ChoiceCardProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  readonly title: string
  readonly description?: string
  readonly leading?: React.ReactNode
  readonly leadingVariant?: "default" | "plain"
  readonly meta?: React.ReactNode
  readonly selected?: boolean
}

export function ChoiceCard({
  title,
  description,
  leading,
  leadingVariant = "default",
  meta,
  selected = false,
  className,
  ref,
  ...props
}: ChoiceCardProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "group flex w-full items-center gap-4 rounded-2xl border-2 border-black/10 bg-card p-5 text-left",
        "transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sticker",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30",
        "active:translate-y-0 active:shadow-none disabled:pointer-events-none disabled:opacity-50",
        "data-[selected=true]:border-primary data-[selected=true]:shadow-sticker",
        "motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      {leading === undefined ? null : (
        <span className={cn(
          "flex size-12 shrink-0 items-center justify-center",
          leadingVariant === "default" && "rounded-xl bg-primary/10 text-2xl",
        )}>
          {leading}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold text-card-foreground">{title}</span>
        {description === undefined ? null : (
          <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        )}
      </span>
      {meta === undefined ? null : (
        <span className="shrink-0 text-sm font-medium text-muted-foreground">{meta}</span>
      )}
    </button>
  )
}
