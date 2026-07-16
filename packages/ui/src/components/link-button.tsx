import * as React from "react"
import { cn } from "../lib/cn.js"

export interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  underline?: boolean
}

export function LinkButton({
  className,
  underline = true,
  ref,
  ...props
}: LinkButtonProps & { ref?: React.Ref<HTMLAnchorElement> }) {
  return (
    <a
      ref={ref}
      className={cn(
        "text-primary font-medium underline-offset-4 transition-colors hover:text-primary/80",
        underline && "hover:underline",
        className
      )}
      {...props}
    />
  )
}
