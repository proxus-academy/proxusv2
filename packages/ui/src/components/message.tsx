import type { ComponentProps } from "react"
import { cn } from "../lib/cn.js"

export function Message({ from, className, ...props }: ComponentProps<"article"> & { readonly from: "user" | "assistant" | "system" | "tool" }) {
  return <article data-role={from} className={cn("group flex w-full gap-3 py-3", from === "user" && "justify-end", className)} {...props} />
}

export function MessageContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed group-data-[role=user]:bg-primary group-data-[role=user]:text-primary-foreground group-data-[role=assistant]:bg-muted", className)} {...props} />
}

export function MessageActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100", className)} {...props} />
}
