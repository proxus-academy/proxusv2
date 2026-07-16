import { Tooltip as TooltipPrimitive } from "radix-ui"
import * as React from "react"
import { cn } from "../lib/cn.js"

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 6,
  ref,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 whitespace-nowrap rounded-2xl border border-gray-200/60 bg-white/70 px-3 py-2",
          "text-[13px] leading-snug text-gray-800 shadow-[0_10px_24px_rgba(0,0,0,0.16)] backdrop-blur-xl",
          "data-[state=delayed-open]:animate-fade-in",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
