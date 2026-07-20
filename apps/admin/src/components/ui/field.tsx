import { useMemo } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const fieldVariants = cva(
  "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  },
)

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border *:data-[slot=field]:p-2.5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className,
      )}
      {...props}
    />
  )
}

const hasRenderableContent = (content: React.ReactNode): boolean =>
  content !== undefined && content !== null && content !== false && content !== ""

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  readonly errors?: ReadonlyArray<{ readonly message?: string } | undefined>
}) {
  const content = useMemo<React.ReactNode>(() => {
    if (hasRenderableContent(children)) {
      return children
    }

    if (errors === undefined || errors.length === 0) {
      return null
    }

    const messages = [
      ...new Set(
        errors.flatMap((error) =>
          error?.message === undefined || error.message.length === 0
            ? []
            : [error.message],
        ),
      ),
    ]

    if (messages.length === 0) {
      return null
    }
    if (messages.length === 1) {
      return messages[0] ?? null
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {messages.map((message) => <li key={message}>{message}</li>)}
      </ul>
    )
  }, [children, errors])

  if (!hasRenderableContent(content)) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

export { Field, FieldError, FieldLabel }
