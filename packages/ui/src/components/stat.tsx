import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "../lib/cn.js"
import { Skeleton } from "./skeleton.js"

const statVariants = cva("rounded-xl border-2 bg-card p-4 text-card-foreground transition-colors", {
  variants: {
    variant: {
      default: "border-black/10",
      success: "border-emerald-200 bg-emerald-50/50",
      warning: "border-amber-200 bg-amber-50/50",
      danger: "border-red-200 bg-red-50/50"
    }
  },
  defaultVariants: {
    variant: "default"
  }
})

export interface StatProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof statVariants> {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  trend?: { value: number; isPositive: boolean }
  loading?: boolean
}

export function Stat({ title, value, description, icon, trend, variant, loading = false, className, ...props }: StatProps) {
  if (loading) {
    return (
      <div className={cn(statVariants({ variant }), className)} {...props}>
        <Skeleton className="mb-2 h-4 w-20" />
        <Skeleton className="mb-1 h-8 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
    )
  }

  return (
    <div className={cn(statVariants({ variant }), className)} {...props}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium text-muted-foreground">{title}</span>
          <span className="truncate text-lg font-bold text-foreground">{value}</span>
        </div>
        {icon && <div className="h-4 w-4 flex-shrink-0 text-primary">{icon}</div>}
      </div>
      {(description !== undefined || trend !== undefined) && (
        <div className="mt-1 flex items-center justify-between text-xs">
          {description && <span className="truncate text-muted-foreground">{description}</span>}
          {trend && (
            <span className={cn("font-medium", trend.isPositive ? "text-emerald-600" : "text-red-600")}>
              {trend.isPositive ? "+" : "-"}
              {Math.abs(trend.value)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}
