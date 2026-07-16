import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "../lib/cn.js"

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-sm font-semibold transition-colors",
  {
    variants: {
      variant: {
        neutral: "bg-white border-gray-200 text-gray-700",
        primary: "bg-primary/10 border-primary/25 text-primary",
        gold: "bg-supermagia/10 border-supermagia/30 text-supermagia"
      },
      size: {
        sm: "h-7 px-2 text-xs",
        default: "h-8 px-2.5 text-sm"
      }
    },
    defaultVariants: {
      variant: "neutral",
      size: "default"
    }
  }
)

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chipVariants> {
  icon?: React.ReactNode
}

export function Chip({ className, variant, size, icon, children, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ variant, size }), className)} {...props}>
      {icon}
      {children}
    </span>
  )
}
