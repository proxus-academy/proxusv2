import { ChevronLeft, ChevronRight } from "lucide-react"
import * as React from "react"
import { cn } from "../lib/cn.js"

export interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  className?: string
  siblingCount?: number
  align?: "start" | "center" | "end"
}

function buildRange(page: number, pageCount: number, siblingCount: number): ReadonlyArray<number | "ellipsis"> {
  const totalVisible = siblingCount * 2 + 5
  if (pageCount <= totalVisible) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }

  const left = Math.max(page - siblingCount, 2)
  const right = Math.min(page + siblingCount, pageCount - 1)

  const range: Array<number | "ellipsis"> = [1]
  if (left > 2) range.push("ellipsis")
  for (let i = left; i <= right; i++) range.push(i)
  if (right < pageCount - 1) range.push("ellipsis")
  range.push(pageCount)
  return range
}

export function Pagination({ page, pageCount, onPageChange, align = "start", className, siblingCount = 1 }: PaginationProps) {
  const range = buildRange(page, pageCount, siblingCount)

  return (
    <nav aria-label="Paginación" className={cn("flex items-center gap-1", align === "center" && "justify-center", align === "end" && "justify-end", className)}>
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {range.map((entry, i) =>
        entry === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            aria-current={entry === page ? "page" : undefined}
            onClick={() => onPageChange(entry)}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors",
              entry === page
                ? "bg-gradient-to-r from-primary to-secondary text-white"
                : "text-foreground hover:bg-accent"
            )}
          >
            {entry}
          </button>
        )
      )}

      <button
        type="button"
        aria-label="Página siguiente"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  )
}
