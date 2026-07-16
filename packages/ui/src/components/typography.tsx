import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "../lib/cn.js"

const headingVariants = cva("font-semibold tracking-tight text-foreground", {
  variants: {
    level: {
      1: "text-3xl md:text-4xl font-bold",
      2: "text-2xl md:text-3xl font-bold",
      3: "text-xl md:text-2xl",
      4: "text-lg md:text-xl"
    }
  },
  defaultVariants: {
    level: 2
  }
})

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement>, VariantProps<typeof headingVariants> {
  as?: "h1" | "h2" | "h3" | "h4"
}

export function Heading({ className, level, as, ref, ...props }: HeadingProps & { ref?: React.Ref<HTMLHeadingElement> }) {
  const resolvedLevel = level ?? 2
  const Comp = as ?? (`h${resolvedLevel}` as const)
  return <Comp ref={ref} className={cn(headingVariants({ level: resolvedLevel }), className)} {...props} />
}

const textVariants = cva("text-foreground", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
      default: "text-base",
      lg: "text-lg"
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      destructive: "text-destructive"
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold"
    }
  },
  defaultVariants: {
    size: "default",
    tone: "default",
    weight: "normal"
  }
})

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement>, VariantProps<typeof textVariants> {
  as?: "p" | "span" | "div"
}

export function Text({ className, size, tone, weight, as = "p", ref, ...props }: TextProps & { ref?: React.Ref<HTMLParagraphElement> }) {
  const Comp = as
  return <Comp ref={ref} className={cn(textVariants({ size, tone, weight }), className)} {...props} />
}
