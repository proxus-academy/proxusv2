import * as React from "react"
import { cn } from "../lib/cn.js"

export function Skeleton({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}
