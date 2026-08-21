import type * as React from "react"
import { cn } from "../lib/cn.js"

type Responsive<T> = T | Readonly<{ base?: T; md?: T; lg?: T; xl?: T }>
type Element = "div" | "main" | "section" | "article" | "aside" | "header" | "footer" | "nav" | "form"

const responsive = <T extends string>(value: Responsive<T> | undefined, classes: Readonly<Record<T, string>>, prefixes: Readonly<Record<"md" | "lg" | "xl", string>>): string => {
  if (value === undefined) return ""
  if (typeof value === "string") return classes[value]
  return cn(
    value.base === undefined ? undefined : classes[value.base],
    value.md === undefined ? undefined : prefixes.md + classes[value.md],
    value.lg === undefined ? undefined : prefixes.lg + classes[value.lg],
    value.xl === undefined ? undefined : prefixes.xl + classes[value.xl]
  )
}

const gap = { none: "gap-0", xs: "gap-1", sm: "gap-2", md: "gap-3", lg: "gap-4", xl: "gap-6", "2xl": "gap-8" } as const
const padding = { none: "p-0", xs: "p-1", sm: "p-2", md: "p-3", lg: "p-4", xl: "p-6", "2xl": "p-8" } as const
const align = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch", baseline: "items-baseline" } as const
const justify = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" } as const
const columns = { one: "grid-cols-1", two: "grid-cols-2", three: "grid-cols-3", four: "grid-cols-4", sidebar: "grid-cols-[22rem_minmax(0,1fr)]", "wide-sidebar": "grid-cols-[24rem_minmax(0,1fr)]" } as const
const prefix = { md: "md:", lg: "lg:", xl: "xl:" } as const

interface LayoutProps {
  readonly as?: Element
  readonly children?: React.ReactNode
  readonly id?: string
  readonly role?: React.AriaRole
  readonly labelledBy?: string
  readonly label?: string
  readonly busy?: boolean
  readonly hidden?: boolean
  readonly grow?: boolean
  readonly minHeight?: "none" | "screen" | "viewport" | "full"
  readonly minWidth?: "none" | "full"
  readonly width?: "full" | "auto"
  readonly maxWidth?: "sm" | "md" | "lg" | "content" | "wide" | "none"
  readonly overflow?: "hidden" | "auto" | "x-auto"
  readonly background?: "default" | "muted" | "card" | "transparent"
  readonly padding?: Responsive<keyof typeof padding>
  readonly paddingX?: Responsive<"none" | "sm" | "md" | "lg" | "xl">
  readonly paddingY?: Responsive<"none" | "sm" | "md" | "lg" | "xl" | "2xl">
  readonly border?: "none" | "default" | "bottom"
  readonly radius?: "none" | "md" | "lg" | "xl" | "full"
  readonly position?: "relative" | "sticky"
}

const minHeight = { none: "min-h-0", screen: "min-h-screen", viewport: "min-h-svh", full: "min-h-full" } as const
const maxWidth = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", content: "max-w-4xl", wide: "max-w-[90rem]", none: "max-w-none" } as const
const backgrounds = { default: "bg-background", muted: "bg-muted", card: "bg-card", transparent: "bg-transparent" } as const
const borders = { none: "border-0", default: "border border-border", bottom: "border-b border-border" } as const
const radii = { none: "rounded-none", md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", full: "rounded-full" } as const
const overflow = { hidden: "overflow-hidden", auto: "overflow-auto", "x-auto": "overflow-x-auto" } as const
const px = { none: "px-0", sm: "px-2", md: "px-3", lg: "px-4", xl: "px-6" } as const
const py = { none: "py-0", sm: "py-2", md: "py-3", lg: "py-4", xl: "py-6", "2xl": "py-8" } as const

function layoutClasses(props: LayoutProps): string {
  return cn(
    props.hidden === true && "hidden",
    props.grow === true && "flex-1",
    props.minHeight === undefined ? undefined : minHeight[props.minHeight],
    props.minWidth === "none" && "min-w-0",
    props.minWidth === "full" && "min-w-full",
    props.width === "full" && "w-full",
    props.width === "auto" && "w-auto",
    props.maxWidth === undefined ? undefined : maxWidth[props.maxWidth],
    props.overflow === undefined ? undefined : overflow[props.overflow],
    props.background === undefined ? undefined : backgrounds[props.background],
    responsive(props.padding, padding, prefix),
    responsive(props.paddingX, px, prefix),
    responsive(props.paddingY, py, prefix),
    props.border === undefined ? undefined : borders[props.border],
    props.radius === undefined ? undefined : radii[props.radius],
    props.position === "relative" && "relative",
    props.position === "sticky" && "sticky top-0"
  )
}

export function Box({ as: Component = "div", children, id, role, labelledBy, label, busy, ...props }: LayoutProps) {
  return <Component id={id} role={role} aria-label={label} aria-labelledby={labelledBy} aria-busy={busy} className={layoutClasses(props)}>{children}</Component>
}

interface FlowProps extends LayoutProps {
  readonly gap?: Responsive<keyof typeof gap>
  readonly align?: Responsive<keyof typeof align>
  readonly justify?: Responsive<keyof typeof justify>
  readonly wrap?: boolean
}

export function Stack({ as: Component = "div", children, gap: spacing = "md", align: alignment, justify: distribution, wrap, id, role, labelledBy, label, busy, ...props }: FlowProps) {
  return <Component id={id} role={role} aria-label={label} aria-labelledby={labelledBy} aria-busy={busy} className={cn("flex flex-col", responsive(spacing, gap, prefix), responsive(alignment, align, prefix), responsive(distribution, justify, prefix), wrap === true && "flex-wrap", layoutClasses(props))}>{children}</Component>
}

export function Inline({ as: Component = "div", children, gap: spacing = "md", align: alignment = "center", justify: distribution, wrap, id, role, labelledBy, label, busy, ...props }: FlowProps) {
  return <Component id={id} role={role} aria-label={label} aria-labelledby={labelledBy} aria-busy={busy} className={cn("flex", responsive(spacing, gap, prefix), responsive(alignment, align, prefix), responsive(distribution, justify, prefix), wrap === true && "flex-wrap", layoutClasses(props))}>{children}</Component>
}

interface GridProps extends FlowProps {
  readonly columns?: Responsive<keyof typeof columns>
}

interface FormProps extends Omit<FlowProps, "as"> {
  readonly onSubmit: React.FormEventHandler<HTMLFormElement>
}

export function Form({ children, gap: spacing = "md", align: alignment, justify: distribution, onSubmit, id, labelledBy, busy, ...props }: FormProps) {
  return <form id={id} aria-labelledby={labelledBy} aria-busy={busy} onSubmit={onSubmit} className={cn("flex flex-col", responsive(spacing, gap, prefix), responsive(alignment, align, prefix), responsive(distribution, justify, prefix), layoutClasses(props))}>{children}</form>
}

export function Grid({ as: Component = "div", children, columns: columnCount = "one", gap: spacing = "md", align: alignment, id, role, labelledBy, label, busy, ...props }: GridProps) {
  return <Component id={id} role={role} aria-label={label} aria-labelledby={labelledBy} aria-busy={busy} className={cn("grid", responsive(columnCount, columns, prefix), responsive(spacing, gap, prefix), responsive(alignment, align, prefix), layoutClasses(props))}>{children}</Component>
}

export function Center({ as: Component = "div", children, maxWidth: width = "content", ...props }: LayoutProps) {
  return <Component className={cn("mx-auto", maxWidth[width], layoutClasses(props))}>{children}</Component>
}
