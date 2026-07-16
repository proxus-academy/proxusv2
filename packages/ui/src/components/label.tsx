import { Label as LabelPrimitive } from "radix-ui"
import * as React from "react"
import { cn } from "../lib/cn.js"

export function Label({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { ref?: React.Ref<HTMLLabelElement> }) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn("text-sm font-medium leading-none text-foreground peer-disabled:opacity-50", className)}
      {...props}
    />
  )
}
