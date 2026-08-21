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
    },
    size: {
      default: "",
      hero: "text-4xl leading-[1.08] md:text-6xl",
      display: "text-[2.5rem] leading-tight"
    },
    width: { auto: "", prose: "max-w-2xl" }
  },
  defaultVariants: {
    level: 2
  }
})

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement>, VariantProps<typeof headingVariants> {
  as?: "h1" | "h2" | "h3" | "h4"
}

export function Heading({ className, level, size, width, as, ref, ...props }: HeadingProps & { ref?: React.Ref<HTMLHeadingElement> }) {
  const resolvedLevel = level ?? 2
  const Comp = as ?? (`h${resolvedLevel}` as const)
  return <Comp ref={ref} className={cn(headingVariants({ level: resolvedLevel, size, width }), className)} {...props} />
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
    },
    display: { block: "block", inline: "inline", badge: "inline-flex rounded-full border border-primary/15 bg-primary/10 px-3 py-1" },
    width: { auto: "", prose: "max-w-xl", detail: "max-w-md" },
    align: { start: "text-left", center: "text-center", end: "text-right" },
    wrap: { normal: "", anywhere: "break-all" }
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

export function Text({ className, size, tone, weight, display, width, align, wrap, as = "p", ref, ...props }: TextProps & { ref?: React.Ref<HTMLParagraphElement> }) {
  const Comp = as
  return <Comp ref={ref} className={cn(textVariants({ size, tone, weight, display, width, align, wrap }), className)} {...props} />
}
