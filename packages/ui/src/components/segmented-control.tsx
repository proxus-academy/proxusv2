import * as React from "react"
import { cn } from "../lib/cn.js"

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedControlOption<T>>
  value: T
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({ options, value, onChange, className }: SegmentedControlProps<T>) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-xl border border-gray-200 bg-white p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            option.value === value
              ? "bg-primary text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
