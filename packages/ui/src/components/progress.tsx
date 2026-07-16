import { Progress as ProgressPrimitive } from "radix-ui"
import * as React from "react"
import { cn } from "../lib/cn.js"

export function Progress({
  className,
  value,
  ref,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-gray-200", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-gradient-to-r from-primary to-secondary transition-transform duration-300"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
