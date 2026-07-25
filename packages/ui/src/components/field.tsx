import * as React from "react"
import { cn } from "../lib/cn.js"
import { Label } from "./label.js"

export interface FieldProps extends React.ComponentProps<"div"> {
  readonly invalid?: boolean
  readonly disabled?: boolean
  readonly orientation?: "vertical" | "horizontal"
}

export function Field({ className, invalid = false, disabled = false, orientation = "vertical", ...props }: FieldProps) {
  return <div
    role="group"
    data-slot="field"
    data-invalid={invalid || undefined}
    data-disabled={disabled || undefined}
    data-orientation={orientation}
    className={cn(
      "group/field flex w-full gap-2 data-[disabled=true]:opacity-60",
      orientation === "vertical" ? "flex-col" : "flex-row items-start",
      className,
    )}
    {...props}
  />
}

export function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("font-medium leading-snug", className)} {...props} />
}

export function FieldControl({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-control" className={cn("min-w-0 flex-1", className)} {...props} />
}

export function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

const messagesOf = (errors: ReadonlyArray<{ readonly message?: string } | undefined>) =>
  [...new Set(errors.flatMap((error) => error?.message === undefined || error.message === "" ? [] : [error.message]))]

export function FieldError({ className, children, errors = [], ...props }: React.ComponentProps<"div"> & {
  readonly errors?: ReadonlyArray<{ readonly message?: string } | undefined>
}) {
  const messages = messagesOf(errors)
  const content = children ?? (messages.length <= 1
    ? messages[0]
    : <ul className="ml-4 list-disc">{messages.map((message) => <li key={message}>{message}</li>)}</ul>)
  if (content === undefined || content === null || content === false || content === "") return null
  return <div role="alert" data-slot="field-error" className={cn("text-sm text-destructive", className)} {...props}>{content}</div>
}

export function FieldSet({ className, disabled, ...props }: React.ComponentProps<"fieldset">) {
  return <fieldset data-slot="field-set" data-disabled={disabled || undefined} disabled={disabled} className={cn("space-y-4 disabled:opacity-60", className)} {...props} />
}

export function FieldLegend({ className, ...props }: React.ComponentProps<"legend">) {
  return <legend data-slot="field-legend" className={cn("font-semibold", className)} {...props} />
}
