import { Badge, Button, Progress, Text, cn } from "@proxus/ui"
import type { ReactNode } from "react"
import { CreatorIcon } from "./icons.js"
import type {
  CreatorAction,
  CreatorPayment,
  CreatorVideo,
  PresentationTone,
} from "./types.js"

const toneClasses = {
  neutral: "border-slate-200 bg-white",
  positive: "border-border bg-white",
  warning: "border-border bg-white",
  negative: "border-border bg-white",
  brand: "border-border bg-white",
} satisfies Record<PresentationTone, string>

const badgeVariants = {
  neutral: "default",
  positive: "success",
  warning: "warning",
  negative: "danger",
  brand: "primary",
} satisfies Record<PresentationTone, "default" | "success" | "warning" | "danger" | "primary">

export function StatusSurface({
  tone,
  statusLabel,
  children,
}: {
  readonly tone: PresentationTone
  readonly statusLabel: string
  readonly children: ReactNode
}) {
  return (
    <section className={cn("overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-7 lg:p-8", toneClasses[tone])}>
      <Badge variant={badgeVariants[tone]} size="lg">
        {statusLabel}
      </Badge>
      {children}
    </section>
  )
}

export function ActionButtons({
  primary,
  secondary,
  onAction,
}: {
  readonly primary: CreatorAction | undefined
  readonly secondary: CreatorAction | undefined
  readonly onAction: (action: CreatorAction) => void
}) {
  if (primary === undefined && secondary === undefined) return null
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      {primary === undefined ? null : (
        <Button
          size="lg"
          className="w-full sm:w-auto"
          icon={primary.kind === "upload" ? <CreatorIcon name="upload" className="size-5" /> : undefined}
          onClick={() => onAction(primary)}
        >
          {primary.label}
        </Button>
      )}
      {secondary === undefined ? null : (
        <Button
          size="lg"
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => onAction(secondary)}
        >
          {secondary.label}
        </Button>
      )}
    </div>
  )
}

export function ProgressSummary({
  value,
  label,
  detail,
}: {
  readonly value: number
  readonly label: string
  readonly detail: string
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-4">
        <Text weight="semibold">{label}</Text>
        <Text size="sm" tone="muted" className="text-right">
          {detail}
        </Text>
      </div>
      <Progress value={value} aria-label={label} />
    </div>
  )
}

const videoStatusVariant = {
  Aceptado: "success",
  "En revisión": "warning",
  "Necesita cambios": "danger",
  Bloqueado: "default",
} as const

export function VideoRow({
  video,
  compact = false,
}: {
  readonly video: CreatorVideo
  readonly compact?: boolean
}) {
  const detail = compact
    ? video.publishedAt
    : [video.context, video.format, video.publishedAt].join(" · ")

  if (compact) {
    return (
      <article className="flex items-center gap-3 border-b border-border/70 py-4 last:border-b-0">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 text-primary">
          <CreatorIcon name="play" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground sm:text-base">{video.title}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
            {detail} · {video.totalViews} views
          </p>
        </div>
        <Badge variant={videoStatusVariant[video.status]} size="sm">
          {video.status}
        </Badge>
      </article>
    )
  }

  return (
    <article className="border-b border-border/70 py-5 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 text-primary sm:size-14">
          <CreatorIcon name="play" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground sm:text-base">{video.title}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">{detail}</p>
            </div>
            <Badge variant={videoStatusVariant[video.status]}>{video.status}</Badge>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl bg-muted/45 p-3 sm:grid-cols-[1.5fr_1fr_1fr]">
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://${video.tiktokUrl}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-950 px-2.5 py-1.5 text-xs font-semibold text-white"
              >
                <span>TT</span>
                {video.tiktokViews}
              </a>
              <a
                href={`https://${video.instagramUrl}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-pink-50 px-2.5 py-1.5 text-xs font-semibold text-pink-700"
              >
                <span>IG</span>
                {video.instagramViews}
              </a>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Referencia</p>
              <p className="mt-1 text-xs font-semibold text-foreground">{video.reference}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Estimado</p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {video.totalAmount}
                {video.bonusAmount === undefined || video.bonusAmount === "—" ? null : (
                  <span className="ml-1 text-xs font-semibold text-emerald-600">({video.bonusAmount})</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

export function PaymentRow({ payment }: { readonly payment: CreatorPayment }) {
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-3 border-b border-border/70 py-4 text-left last:border-b-0 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <CreatorIcon name="wallet" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{payment.campaign}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{payment.period}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {payment.baseAmount} fijo · {payment.bonusAmount} bonus
          {payment.paidAt === undefined ? null : ` · Pagado el ${payment.paidAt}`}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-bold text-foreground sm:text-base">{payment.amount}</span>
        <Badge className="mt-1" variant={payment.status === "Pagado" ? "success" : "warning"} size="sm">
          {payment.status}
        </Badge>
      </span>
      <CreatorIcon name="arrow" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm sm:p-6">
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
          {description === undefined ? null : (
            <Text className="mt-1" size="sm" tone="muted">
              {description}
            </Text>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
