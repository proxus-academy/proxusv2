import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { Slot } from "radix-ui"
import { cn } from "../lib/cn.js"

/**
 * La sombra "sticker" (offset duro sin blur) es la firma visual de Proxus:
 * aparece en hover sobre superficies sólidas (primary/secondary/soft/destructive),
 * no en variantes planas (ghost/link/outline).
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium " +
    "transition-[color,background-color,border-color,box-shadow] focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-primary to-secondary text-white " +
          "hover:from-primary/90 hover:to-secondary/90 hover:shadow-sticker",
        secondary:
          "bg-white border-2 border-gray-200 text-gray-700 shadow-sm " +
          "hover:bg-gray-50 hover:shadow-sticker",
        soft:
          "bg-primary/10 text-primary border-2 border-primary/25 hover:bg-primary/15 hover:shadow-sticker",
        outline: "border border-border bg-transparent text-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-sticker",
        "destructive-soft":
          "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/15"
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-12 w-12"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default"
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  icon?: React.ReactNode
  iconPosition?: "left" | "right"
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  icon,
  iconPosition = "left",
  loading = false,
  children,
  disabled,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled === true || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : Boolean(icon) && iconPosition === "left" ? (
        icon
      ) : null}
      {children}
      {!loading && Boolean(icon) && iconPosition === "right" ? icon : null}
    </Comp>
  )
}
