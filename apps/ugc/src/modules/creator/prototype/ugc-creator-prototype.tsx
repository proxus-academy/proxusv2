import { Avatar, Button, Text, cn } from "@proxus/ui"
import { useState } from "react"
import { MeetingDialog, UploadVideoDialog } from "./creator-dialogs.js"
import { homePresentations, payments, videos } from "./fixtures.js"
import { CreatorHome } from "./creator-home.js"
import { CreatorIcon, type CreatorIconName } from "./icons.js"
import { CreatorPayments } from "./creator-payments.js"
import { CreatorProfile } from "./creator-profile.js"
import { CreatorVideos } from "./creator-videos.js"
import type { CreatorAction, CreatorPortalPage, CreatorScenario } from "./types.js"

const navigation: ReadonlyArray<{
  readonly page: CreatorPortalPage
  readonly label: string
  readonly icon: CreatorIconName
}> = [
  { page: "home", label: "Inicio", icon: "home" },
  { page: "videos", label: "Vídeos", icon: "video" },
  { page: "payments", label: "Pagos", icon: "wallet" },
  { page: "profile", label: "Perfil", icon: "user" },
]

const scenariosWithVideos = new Set<CreatorScenario>([
  "trialPublishing",
  "trialReview",
  "trialNotPassed",
  "waitingCampaign",
  "campaignScheduled",
  "campaignActive",
  "campaignReview",
  "campaignFinalized",
  "suspended",
  "exited",
])

const scenariosWithPayments = new Set<CreatorScenario>([
  "waitingCampaign",
  "campaignScheduled",
  "campaignActive",
  "campaignReview",
  "campaignFinalized",
  "suspended",
  "exited",
])

const uploadScenarios = new Set<CreatorScenario>(["trialPublishing", "campaignActive"])

function CreatorNavigation({
  page,
  scenario,
  onNavigate,
  mobile = false,
}: {
  readonly page: CreatorPortalPage
  readonly scenario: CreatorScenario
  readonly onNavigate: (page: CreatorPortalPage) => void
  readonly mobile?: boolean
}) {
  const visibleNavigation = navigation.filter(
    (item) =>
      item.page !== "videos" ||
      scenariosWithVideos.has(scenario),
  ).filter(
    (item) =>
      item.page !== "payments" ||
      scenariosWithPayments.has(scenario),
  )

  if (mobile) {
    return (
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-md justify-around">
          {visibleNavigation.map((item) => (
            <button
              key={item.page}
              type="button"
              aria-current={page === item.page ? "page" : undefined}
              className={cn(
                "flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition-colors",
                page === item.page ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onNavigate(item.page)}
            >
              <CreatorIcon name={item.icon} className="size-5" />
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    )
  }

  return (
    <nav
      aria-label="Navegación principal"
      className="flex items-center rounded-2xl border border-border bg-muted/60 p-1"
    >
      {visibleNavigation.map((item) => (
        <button
          key={item.page}
          type="button"
          aria-current={page === item.page ? "page" : undefined}
          className={cn(
            "rounded-xl px-4 py-2.5 text-sm font-semibold transition-[color,background-color,box-shadow] xl:px-5",
            page === item.page
              ? "bg-white text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onNavigate(item.page)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export function UgcCreatorPrototype({
  scenario,
  initialPage = "home",
}: {
  readonly scenario: CreatorScenario
  readonly initialPage?: CreatorPortalPage
}) {
  const [page, setPage] = useState<CreatorPortalPage>(initialPage)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [feedback, setFeedback] = useState<string>()
  const canUpload = uploadScenarios.has(scenario)

  const handleAction = (action: CreatorAction) => {
    if (action.kind === "navigate" && action.target !== undefined) {
      setPage(action.target)
      return
    }
    if (action.kind === "upload") {
      setUploadOpen(true)
      return
    }
    if (action.kind === "meeting") {
      setMeetingOpen(true)
      return
    }
    setFeedback("Esta acción continuará en el flujo real de producto.")
  }

  return (
    <div className="min-h-screen bg-background-light-gray text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-sm font-extrabold tracking-[0.18em] text-primary">PROXUS</span>
          <Avatar name="Lucía Romero" size="sm" color="#793ef9" />
        </div>
      </header>

      <header className="sticky top-0 z-30 hidden border-b border-border/80 bg-white/95 backdrop-blur lg:block">
        <div className="mx-auto grid h-[76px] max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-8">
          <div className="flex items-center gap-3">
            <span className="text-base font-extrabold tracking-[0.18em] text-primary">PROXUS</span>
            <span className="hidden h-4 w-px bg-border xl:block" />
            <Text className="hidden xl:block" size="xs" tone="muted">
              Creator Studio
            </Text>
          </div>

          <CreatorNavigation page={page} scenario={scenario} onNavigate={setPage} />

          <div className="flex justify-end">
            <button
              type="button"
              className="flex items-center gap-3 rounded-full border border-transparent py-1 pl-3 pr-1 transition-colors hover:border-border hover:bg-muted/60"
              onClick={() => setPage("profile")}
              aria-label="Abrir perfil de Lucía Romero"
            >
              <span className="hidden text-right xl:block">
                <span className="block text-xs font-semibold text-foreground">Lucía Romero</span>
                <span className="block text-[11px] text-muted-foreground">@luciaromero</span>
              </span>
              <Avatar name="Lucía Romero" size="sm" color="#793ef9" />
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto max-w-5xl">
          {feedback === undefined ? null : (
            <div
              role="status"
              className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-sm"
            >
              <span>{feedback}</span>
              <Button size="sm" variant="ghost" onClick={() => setFeedback(undefined)}>
                Cerrar
              </Button>
            </div>
          )}
          {page === "home" ? (
            <CreatorHome presentation={homePresentations[scenario]} onAction={handleAction} />
          ) : page === "videos" ? (
            <CreatorVideos videos={videos} canUpload={canUpload} onUpload={() => setUploadOpen(true)} />
          ) : page === "payments" ? (
            <CreatorPayments payments={payments} />
          ) : (
            <CreatorProfile />
          )}
        </div>
      </main>

      <CreatorNavigation mobile page={page} scenario={scenario} onNavigate={setPage} />
      <UploadVideoDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSubmitted={() => {
          setUploadOpen(false)
          setFeedback("Vídeo registrado. Lo verás en tu historial.")
        }}
      />
      <MeetingDialog
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        onReserved={() => {
          setMeetingOpen(false)
          setFeedback("Reunión reservada. Te enviaremos la confirmación por email.")
        }}
      />
    </div>
  )
}
