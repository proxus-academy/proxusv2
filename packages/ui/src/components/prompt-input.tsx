import { ArrowUp, Paperclip, Square } from "lucide-react"
import { useRef, type ComponentProps, type FormEvent } from "react"
import { cn } from "../lib/cn.js"

export function PromptInput({ onSubmit, className, children, ...props }: Omit<ComponentProps<"form">, "onSubmit"> & { readonly onSubmit?: (value: string) => void }) {
  const input = useRef<HTMLTextAreaElement>(null)
  const submit = (event: FormEvent) => { event.preventDefault(); const value = input.current?.value.trim() ?? ""; if (value !== "") { onSubmit?.(value); if (input.current !== null) input.current.value = "" } }
  return <form onSubmit={submit} className={cn("rounded-2xl border bg-background p-2 shadow-sm", className)} {...props}><textarea ref={input} aria-label="Mensaje" rows={2} className="max-h-48 min-h-14 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />{children}</form>
}

export function PromptInputToolbar({ className, ...props }: ComponentProps<"div">) { return <div className={cn("flex items-center justify-between gap-2", className)} {...props} /> }
export function PromptInputAttach({ ...props }: ComponentProps<"button">) { return <button type="button" aria-label="Adjuntar archivos" className="grid size-9 place-items-center rounded-lg hover:bg-muted" {...props}><Paperclip className="size-4" /></button> }
export function PromptInputSubmit({ running = false, ...props }: ComponentProps<"button"> & { readonly running?: boolean }) { return <button type="submit" aria-label={running ? "Detener" : "Enviar"} className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50" {...props}>{running ? <Square className="size-3 fill-current" /> : <ArrowUp className="size-4" />}</button> }
