import type { ReactNode } from "react"

export function VisuallyHidden({ children }: { readonly children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
