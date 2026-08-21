import * as React from "react"

import { cn } from "../lib/cn.js"

function Card({
  className,
  size = "default",
  fill = false,
  surface = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm"; readonly fill?: boolean; readonly surface?: "default" | "muted" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        fill && "min-h-0 flex-1",
        surface === "muted" && "rounded-lg border border-border bg-card/60 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, divider = false, ...props }: React.ComponentProps<"div"> & { readonly divider?: boolean }) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        divider && "border-b pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, layout = "default", ...props }: React.ComponentProps<"div"> & { readonly layout?: "default" | "flow" | "scroll" }) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", layout === "flow" && "flex min-h-0 flex-1 flex-col gap-4", layout === "scroll" && "min-h-0 flex-1 overflow-auto", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
}
