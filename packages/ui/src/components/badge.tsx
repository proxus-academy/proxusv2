import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import * as React from "react"
import { cn } from "../lib/cn.js"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground border-border",
        primary: "bg-primary/10 text-primary border-primary/20",
        success: "bg-emerald-50 text-emerald-700 border-emerald-200",
        warning: "bg-amber-50 text-amber-700 border-amber-200",
        danger: "bg-destructive/10 text-destructive border-destructive/20",
        outline: "bg-transparent text-muted-foreground border-border"
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        default: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode
  removable?: boolean
  onRemove?: () => void
}

export function Badge({ className, variant, size, icon, removable = false, onRemove, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon}
      <span className="truncate">{children}</span>
      {removable && (
        <button
          type="button"
          aria-label="Quitar"
          onClick={(e) => {
            e.stopPropagation()
            onRemove?.()
          }}
          className="-mr-0.5 ml-0.5 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm text-current/70 hover:bg-current/10 hover:text-current"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}
