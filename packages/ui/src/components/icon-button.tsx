import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { cn } from "../lib/cn.js"

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-lg transition-all duration-200 " +
    "disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300",
        primary:
          "bg-gradient-to-r from-primary to-secondary text-white hover:from-primary/90 hover:to-secondary/90",
        destructive: "border border-destructive bg-destructive text-white hover:bg-destructive/90",
        ghost: "bg-transparent text-gray-600 hover:bg-gray-100/80",
        "destructive-ghost": "border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15"
      },
      size: {
        sm: "h-8 w-8",
        default: "h-8 w-8",
        lg: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title">,
    VariantProps<typeof iconButtonVariants> {
  icon: React.ReactNode
  title: string
  loading?: boolean
}

export function IconButton({
  className,
  variant,
  size,
  icon,
  title,
  loading = false,
  disabled,
  ref,
  ...props
}: IconButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled === true || loading}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    </button>
  )
}
