import * as React from "react"
import { cn } from "../lib/cn.js"

export interface CounterProps extends Omit<React.HTMLAttributes<HTMLElement>, "onClick"> {
  icon?: React.ReactNode
  value: string | number
  label?: string
  size?: "sm" | "default"
  onClick?: (e: React.MouseEvent) => void
}

export function Counter({ icon, value, label, size = "default", onClick, className, ...props }: CounterProps) {
  const iconSize = size === "sm" ? "h-5 w-5" : "h-6 w-6"
  const textSize = size === "sm" ? "text-xs" : "text-sm md:text-base"
  const isClickable = onClick !== undefined
  const Comp = isClickable ? "button" : "div"

  return (
    <Comp
      type={isClickable ? "button" : undefined}
      onClick={onClick}
      aria-label={label !== undefined ? `${label}: ${value}` : String(value)}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-gray-200 bg-white px-2 md:h-10",
        isClickable && "cursor-pointer transition-shadow hover:shadow-sticker hover:bg-gray-50",
        className
      )}
      {...props}
    >
      {Boolean(icon) && <span className={cn(iconSize, "flex-shrink-0")}>{icon}</span>}
      {label !== undefined && label !== "" && <span className="text-xs text-gray-600">{label}:</span>}
      <span className={cn(textSize, "font-bold text-primary")}>{value}</span>
    </Comp>
  )
}
