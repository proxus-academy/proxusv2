import { ArrowDown } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react"
import { cn } from "../lib/cn.js"

export function MessageScroller({ className, children, ...props }: ComponentProps<"div">) {
  const viewport = useRef<HTMLDivElement>(null)
  const [following, setFollowing] = useState(true)
  const scrollToEnd = useCallback((behavior: ScrollBehavior = "smooth") => viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior }), [])
  useEffect(() => { if (following) scrollToEnd("auto") }, [children, following, scrollToEnd])
  return <div className="relative min-h-0 flex-1">
    <div ref={viewport} onScroll={(event) => {
      const node = event.currentTarget
      setFollowing(node.scrollHeight - node.scrollTop - node.clientHeight < 48)
    }} className={cn("h-full overflow-y-auto overscroll-contain", className)} {...props}>{children}</div>
    {!following && <button type="button" aria-label="Ir al último mensaje" onClick={() => scrollToEnd()} className="absolute bottom-3 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border bg-background shadow-sm"><ArrowDown className="size-4" /></button>}
  </div>
}
