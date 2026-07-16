import * as React from "react"
import { cn } from "../lib/cn.js"

const sizeClasses = {
  sm: { container: "h-10 w-10", text: "text-xs", border: "border" },
  default: { container: "h-14 w-14", text: "text-sm", border: "border-2" },
  lg: { container: "h-28 w-28", text: "text-2xl", border: "border-2" }
} as const

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  name?: string
  color?: string
  size?: keyof typeof sizeClasses
  detail?: React.ReactNode
}

export function Avatar({ src, name, color = "#e0e7ef", size = "default", detail, className, ref, ...props }: AvatarProps & {
  ref?: React.Ref<HTMLDivElement>
}) {
  const [imgFailed, setImgFailed] = React.useState(false)
  const { container, text, border } = sizeClasses[size]
  const initial = name !== undefined && name !== "" ? name.charAt(0).toUpperCase() : "?"

  return (
    <div ref={ref} className={cn("relative inline-block flex-shrink-0", className)} {...props}>
      <div
        className={cn(container, border, "flex items-center justify-center overflow-hidden rounded-full border-black")}
        style={{ backgroundColor: color }}
      >
        {src != null && src !== "" && !imgFailed ? (
          <img
            src={src}
            alt={name ?? "Avatar"}
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className={cn(text, "font-bold text-white")}>{initial}</span>
        )}
      </div>
      {detail !== undefined && <div className="absolute -bottom-1 -right-1">{detail}</div>}
    </div>
  )
}
