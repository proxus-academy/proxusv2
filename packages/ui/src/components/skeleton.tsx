import * as React from "react"
import { cn } from "../lib/cn.js"

export function Skeleton({ className, size = "line", ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { readonly size?: "line" | "row" | "card"; ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("animate-pulse bg-muted", size === "line" && "h-4 rounded-md", size === "row" && "h-16 rounded-md", size === "card" && "h-24 rounded-2xl", className)} {...props} />
}
