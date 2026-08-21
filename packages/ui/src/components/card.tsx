import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "../lib/cn.js"

const cardVariants = cva("relative overflow-hidden rounded-xl bg-card text-card-foreground border-2 border-black/10", {
  variants: {
    variant: {
      static: "",
      interactive:
        "cursor-pointer transition-all duration-200 hover:border-black/30 hover:shadow-sticker " +
        "active:translate-y-px active:shadow-none"
    },
    padding: {
      none: "",
      sm: "p-2",
      default: "p-4",
      lg: "p-5"
    }
  },
  defaultVariants: {
    variant: "static",
    padding: "default"
  }
})

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> { readonly marginTop?: "none" | "lg" | "xl" }

export function Card({ className, variant, padding, marginTop = "none", ref, ...props }: CardProps & { ref?: React.Ref<HTMLDivElement> }) {
  const interactiveProps =
    variant === "interactive"
      ? {
          role: "button" as const,
          tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              e.currentTarget.click()
            }
          }
        }
      : {}

  return (
    <div ref={ref} className={cn(cardVariants({ variant, padding }), marginTop === "lg" && "mt-4", marginTop === "xl" && "mt-6", className)} {...interactiveProps} {...props} />
  )
}

export function CardHeader({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex flex-col space-y-1.5 pb-4", className)} {...props} />
}

export function CardTitle({ className, ref, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return <h3 ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
}

export function CardDescription({ className, ref, ...props }: React.HTMLAttributes<HTMLParagraphElement> & { ref?: React.Ref<HTMLParagraphElement> }) {
  return <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export function CardContent({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn(className)} {...props} />
}

export function CardFooter({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex items-center pt-4", className)} {...props} />
}
