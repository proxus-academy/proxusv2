import { Badge, Button, Heading, Text, cn } from "@proxus/ui"
import { CreatorIcon } from "./icons.js"
import {
  ActionButtons,
  PaymentRow,
  ProgressSummary,
  Section,
  StatusSurface,
  VideoRow,
} from "./shared.js"
import type {
  CampaignSummary,
  CreatorAction,
  CreatorHomePresentation,
  CreatorPerformance,
  CreatorRequirement,
  MeetingSummary,
} from "./types.js"

const noticeClasses = {
  info: "border-primary/20 bg-primary/[0.06] text-primary",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
} as const

function Notice({
  notice,
}: {
  readonly notice: NonNullable<CreatorHomePresentation["notice"]>
}) {
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4", noticeClasses[notice.tone])}>
      <CreatorIcon name={notice.tone === "success" ? "check" : "alert"} className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="text-sm font-bold">{notice.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/70">{notice.description}</p>
      </div>
    </div>
  )
}

function Requirements({
  requirements,
  onAction,
}: {
  readonly requirements: ReadonlyArray<CreatorRequirement>
  readonly onAction: (action: CreatorAction) => void
}) {
  return (
    <Section title="Tus próximos pasos">
      <ol>
        {requirements.map((requirement) => (
          <li
            key={requirement.id}
            className="flex items-center gap-3 border-b border-border/70 py-4 first:pt-1 last:border-0 last:pb-1"
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                requirement.completed
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : requirement.current === true
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 bg-white text-gray-400",
              )}
            >
              {requirement.completed ? (
                <CreatorIcon name="check" className="size-4" />
              ) : (
                <span className="size-2 rounded-full bg-current" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  requirement.completed ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {requirement.label}
              </span>
              {requirement.detail === undefined ? null : (
                <span className="mt-0.5 block text-xs text-muted-foreground">{requirement.detail}</span>
              )}
            </span>
            {requirement.current === true ? (
              <Button
                size="sm"
                variant="soft"
                onClick={() => onAction({ label: requirement.label, kind: "noop" })}
              >
                Continuar
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  )
}

function MeetingCard({ meeting }: { readonly meeting: MeetingSummary }) {
  return (
    <Section title="Tu próxima reunión">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CreatorIcon name="calendar" className="size-6" />
        </div>
        <div>
          <p className="font-bold text-foreground">{meeting.date}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {meeting.time} · {meeting.timezone}
          </p>
          <p className="mt-3 text-sm text-foreground">
            Reunión con <strong>{meeting.manager}</strong>
          </p>
        </div>
      </div>
    </Section>
  )
}

function CampaignDetails({ campaign }: { readonly campaign: CampaignSummary }) {
  return (
    <Section title="Información de la campaña" description={campaign.dates}>
      <dl className="grid gap-x-8 gap-y-5 pt-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tu nivel</dt>
          <dd className="mt-1 font-semibold text-foreground">{campaign.tier}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compensación</dt>
          <dd className="mt-1 font-semibold text-foreground">{campaign.compensation}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equipo</dt>
          <dd className="mt-1 font-semibold text-foreground">{campaign.group}</dd>
          <dd className="text-sm text-muted-foreground">{campaign.manager}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bonos</dt>
          <dd className="mt-1 font-semibold text-foreground">{campaign.bonus}</dd>
        </div>
      </dl>
      <div className="mt-5 border-t border-border pt-5">
        <Text size="sm" weight="semibold">
          Formatos disponibles
        </Text>
        <div className="mt-2 flex flex-wrap gap-2">
          {campaign.formats.map((format) => (
            <Badge key={format} variant="outline">
              {format}
            </Badge>
          ))}
        </div>
      </div>
    </Section>
  )
}

function PerformanceOverview({ performance }: { readonly performance: CreatorPerformance }) {
  const isTrial = performance.estimatedEarnings === "Prueba"
  const metrics = [
    { label: "Views en TikTok", value: performance.tiktokViews, detail: "Validadas" },
    { label: "Views en Instagram", value: performance.instagramViews, detail: "Validadas" },
    { label: "Referidos", value: performance.referrals, detail: "Esta campaña" },
    {
      label: isTrial ? "Pago durante la prueba" : "Total estimado",
      value: isTrial ? "No aplica" : performance.estimatedEarnings,
      detail: isTrial
        ? "La prueba no genera pagos"
        : `${performance.fixedEarnings} fijo · ${performance.bonusEarnings} bonus`,
    },
  ] as const

  return (
    <section aria-labelledby="campaign-summary-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="campaign-summary-title" className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          Tu actividad
        </h2>
        {performance.pendingVideos === 0 ? null : (
          <Badge variant="outline">
            {performance.pendingVideos} {performance.pendingVideos === 1 ? "vídeo pendiente" : "vídeos pendientes"}
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-2xl border border-border bg-white p-4 shadow-sm sm:grid-cols-4 sm:p-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="text-xs font-semibold text-muted-foreground">{metric.label}</dt>
            <dd className="mt-1.5 truncate text-xl font-bold tabular-nums text-foreground sm:text-2xl">
              {metric.value}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">{metric.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function CreatorHome({
  presentation,
  onAction,
}: {
  readonly presentation: CreatorHomePresentation
  readonly onAction: (action: CreatorAction) => void
}) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <StatusSurface tone={presentation.tone} statusLabel={presentation.statusLabel}>
        <div className="mt-5 max-w-2xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Heading level={1} className="max-w-xl text-[1.75rem] leading-tight sm:text-4xl">
              {presentation.title}
            </Heading>
            {presentation.deadline === undefined ? null : (
              <Badge variant="warning" size="lg" icon={<CreatorIcon name="clock" className="size-4" />}>
                {presentation.deadline}
              </Badge>
            )}
          </div>
          <Text className="mt-3 max-w-xl leading-relaxed" tone="muted">
            {presentation.description}
          </Text>
          {presentation.meta === undefined ? null : (
            <Text className="mt-4" size="sm" weight="medium">
              {presentation.meta}
            </Text>
          )}
        </div>
        {presentation.progress === undefined ? null : <ProgressSummary {...presentation.progress} />}
        <ActionButtons
          primary={presentation.primaryAction}
          secondary={presentation.secondaryAction}
          onAction={onAction}
        />
      </StatusSurface>

      {presentation.notice === undefined ? null : <Notice notice={presentation.notice} />}
      {presentation.requirements === undefined ? null : (
        <Requirements requirements={presentation.requirements} onAction={onAction} />
      )}
      {presentation.meeting === undefined ? null : <MeetingCard meeting={presentation.meeting} />}
      {presentation.performance === undefined ? null : (
        <PerformanceOverview performance={presentation.performance} />
      )}

      {presentation.recentVideos === undefined ? null : (
        <Section
          title="Vídeos recientes"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction({ label: "Ver todos", kind: "navigate", target: "videos" })}
            >
              Historial
            </Button>
          }
        >
          <div>
            {presentation.recentVideos.map((video) => (
              <VideoRow key={video.id} video={video} compact />
            ))}
          </div>
        </Section>
      )}

      {presentation.pendingPayment === undefined ? null : (
        <Section title="Tu pago" description="Desglose generado al cerrar la campaña">
          <PaymentRow payment={presentation.pendingPayment} />
        </Section>
      )}
      {presentation.campaign === undefined ? null : <CampaignDetails campaign={presentation.campaign} />}
    </div>
  )
}
