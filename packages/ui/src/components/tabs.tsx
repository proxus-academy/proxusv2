import { Tabs as TabsPrimitive } from "radix-ui"
import * as React from "react"
import { cn } from "../lib/cn.js"

export const Tabs = TabsPrimitive.Root

export function TabsList({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center gap-1 rounded-lg border border-border/60 bg-muted/60 p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex min-w-20 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
        "text-muted-foreground transition-colors data-[state=active]:text-foreground",
        "data-[state=inactive]:hover:bg-accent/50",
        "data-[state=active]:border data-[state=active]:border-border/80 data-[state=active]:bg-background data-[state=active]:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export function TabsContent({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content> & { ref?: React.Ref<HTMLDivElement> }) {
  return <TabsPrimitive.Content ref={ref} className={cn("mt-4 focus-visible:outline-none", className)} {...props} />
}
