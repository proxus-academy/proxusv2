import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { Toast as ToastPrimitive } from "radix-ui"
import * as React from "react"
import { cn } from "../lib/cn.js"

export const ToastProvider = ToastPrimitive.Provider
export const ToastClose = ToastPrimitive.Close
export const ToastAction = ToastPrimitive.Action

export function ToastViewport({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport> & { ref?: React.Ref<HTMLOListElement> }) {
  return (
    <ToastPrimitive.Viewport
      ref={ref}
      className={cn(
        "fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm",
        className
      )}
      {...props}
    />
  )
}

const toastVariants = cva(
  "relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border-2 p-4 shadow-sticker",
  {
    variants: {
      variant: {
        default: "border-black/10 bg-white text-foreground",
        success: "border-emerald-200 bg-emerald-50 text-emerald-800",
        destructive: "border-red-200 bg-red-50 text-red-800"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

export interface ToastRootProps
  extends React.ComponentProps<typeof ToastPrimitive.Root>,
    VariantProps<typeof toastVariants> {}

export function Toast({ className, variant, ref, ...props }: ToastRootProps & { ref?: React.Ref<HTMLLIElement> }) {
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        toastVariants({ variant }),
        "data-[state=open]:animate-slide-up data-[swipe=end]:animate-slide-down data-[state=closed]:animate-fade-out",
        className
      )}
      {...props}
    />
  )
}

export function ToastTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Title> & { ref?: React.Ref<HTMLDivElement> }) {
  return <ToastPrimitive.Title ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
}

export function ToastDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description> & { ref?: React.Ref<HTMLDivElement> }) {
  return <ToastPrimitive.Description ref={ref} className={cn("text-sm opacity-90", className)} {...props} />
}

export function ToastCloseButton({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Close> & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <ToastPrimitive.Close
      ref={ref}
      className={cn(
        "absolute right-2 top-2 rounded-md p-1 text-current/50 opacity-0 transition-opacity hover:text-current group-hover:opacity-100",
        className
      )}
      {...props}
    >
      <X className="h-4 w-4" />
    </ToastPrimitive.Close>
  )
}
