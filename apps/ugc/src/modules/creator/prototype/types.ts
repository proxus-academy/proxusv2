export type CreatorPortalPage = "home" | "videos" | "payments" | "profile"

export type CreatorScenario =
  | "applicationPending"
  | "applicationRejected"
  | "onboarding"
  | "meetingPending"
  | "meetingScheduled"
  | "meetingMissed"
  | "trialPreparation"
  | "trialWarming"
  | "trialPublishing"
  | "trialReview"
  | "trialNotPassed"
  | "waitingCampaign"
  | "campaignScheduled"
  | "campaignActive"
  | "campaignReview"
  | "campaignFinalized"
  | "suspended"
  | "exited"

export type PresentationTone = "neutral" | "positive" | "warning" | "negative" | "brand"

export interface CreatorAction {
  readonly label: string
  readonly kind: "navigate" | "upload" | "meeting" | "noop"
  readonly target?: CreatorPortalPage
}

export interface CreatorRequirement {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly completed: boolean
  readonly current?: boolean
}

export interface CreatorVideo {
  readonly id: string
  readonly title: string
  readonly context: "Trial" | "Campaña GlowUp" | "Campaña Summer Skin"
  readonly format: string
  readonly publishedAt: string
  readonly status: "Aceptado" | "En revisión" | "Necesita cambios" | "Bloqueado"
  readonly tiktokUrl: string
  readonly instagramUrl: string
  readonly tiktokViews: string
  readonly instagramViews: string
  readonly totalViews: string
  readonly reference: string
  readonly fixedAmount: string
  readonly bonusAmount?: string
  readonly totalAmount: string
}

export interface CreatorPayment {
  readonly id: string
  readonly campaign: string
  readonly period: string
  readonly amount: string
  readonly status: "Pendiente" | "Pagado"
  readonly paidAt?: string
  readonly baseAmount: string
  readonly bonusAmount: string
}

export interface CampaignSummary {
  readonly name: string
  readonly dates: string
  readonly tier: string
  readonly group: string
  readonly manager: string
  readonly formats: ReadonlyArray<string>
  readonly compensation: string
  readonly bonus: string
}

export interface MeetingSummary {
  readonly date: string
  readonly time: string
  readonly timezone: string
  readonly manager: string
  readonly joinUrl?: string
}

export interface CreatorPerformance {
  readonly tiktokViews: string
  readonly instagramViews: string
  readonly referrals: string
  readonly fixedEarnings: string
  readonly bonusEarnings: string
  readonly estimatedEarnings: string
  readonly pendingVideos: number
}

export interface CreatorHomePresentation {
  readonly statusLabel: string
  readonly tone: PresentationTone
  readonly title: string
  readonly description: string
  readonly meta?: string
  readonly deadline?: string
  readonly progress?: {
    readonly value: number
    readonly label: string
    readonly detail: string
  }
  readonly primaryAction?: CreatorAction
  readonly secondaryAction?: CreatorAction
  readonly requirements?: ReadonlyArray<CreatorRequirement>
  readonly meeting?: MeetingSummary
  readonly campaign?: CampaignSummary
  readonly performance?: CreatorPerformance
  readonly recentVideos?: ReadonlyArray<CreatorVideo>
  readonly pendingPayment?: CreatorPayment
  readonly notice?: {
    readonly tone: "info" | "warning" | "danger" | "success"
    readonly title: string
    readonly description: string
  }
}
