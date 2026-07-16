import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import * as React from "react"
import { cn } from "../lib/cn.js"

export type DialogProps = Omit<React.ComponentProps<typeof DialogPrimitive.Root>, "modal">

/** Siempre modal (bloquea la interacción y el scroll detrás) — no es configurable. */
export function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root modal {...props} />
}

export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        className
      )}
      {...props}
    />
  )
}

const dialogContentVariants = cva(
  "fixed z-50 flex min-w-0 flex-col border-2 border-black/10 bg-card text-card-foreground shadow-[0_8px_24px_rgba(0,0,0,0.12)] focus:outline-none " +
    // Móvil: bottom sheet anclado abajo
    "bottom-0 left-1/2 max-h-[92vh] w-full max-w-none -translate-x-1/2 rounded-t-2xl rounded-b-none border-x-0 border-b-0 px-0 " +
    "data-[state=open]:animate-slide-up data-[state=closed]:animate-slide-down " +
    // Desktop (md+): diálogo centrado
    "md:bottom-auto md:top-1/2 md:max-h-[90vh] md:-translate-y-1/2 md:rounded-t-xl md:rounded-b-xl md:border-x md:border-b " +
    "md:data-[state=open]:animate-zoom-in md:data-[state=closed]:animate-zoom-out",
  {
    variants: {
      size: {
        sm: "md:w-full md:max-w-sm",
        md: "md:w-full md:max-w-md",
        lg: "md:w-full md:max-w-lg",
        xl: "md:w-full md:max-w-2xl",
        full: "md:h-[95vh] md:w-[95vw] md:max-w-none"
      }
    },
    defaultVariants: {
      size: "lg"
    }
  }
)

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {}

export function DialogContent({ className, children, size, ref, ...props }: DialogContentProps & {
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content ref={ref} className={cn(dialogContentVariants({ size }), className)} {...props}>
        <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)] md:pb-0">{children}</div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-2 text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-shrink-0 flex-col items-start border-b border-border/50 px-6 py-5", className)}
      {...props}
    />
  )
}

export function DialogFooter({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border/50 px-6 py-4 sm:flex-row sm:justify-end sm:gap-3",
        className
      )}
      {...props}
    />
  )
}

export function DialogTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("flex-1 text-xl font-semibold leading-7 tracking-tight text-foreground", className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description> & { ref?: React.Ref<HTMLParagraphElement> }) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("mt-1.5 text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}
