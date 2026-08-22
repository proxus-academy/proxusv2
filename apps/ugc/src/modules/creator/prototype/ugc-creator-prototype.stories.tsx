import type { Meta, StoryObj } from "@storybook/react-vite"
import { creatorScenarioLabels } from "./fixtures.js"
import type { CreatorPortalPage, CreatorScenario } from "./types.js"
import { UgcCreatorPrototype } from "./ugc-creator-prototype.js"

const scenarios = [
  "applicationPending",
  "applicationRejected",
  "onboarding",
  "meetingPending",
  "meetingScheduled",
  "meetingMissed",
  "trialPreparation",
  "trialWarming",
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
] as const satisfies ReadonlyArray<CreatorScenario>
const pages: ReadonlyArray<CreatorPortalPage> = ["home", "videos", "payments", "profile"]

const meta = {
  title: "Prototipos/UGC Creator",
  component: UgcCreatorPrototype,
  render: (args) => (
    <UgcCreatorPrototype
      key={`${args.scenario}:${args.initialPage ?? "home"}`}
      {...args}
    />
  ),
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    scenario: {
      control: "select",
      options: scenarios,
      labels: creatorScenarioLabels,
    },
    initialPage: {
      control: "select",
      options: pages,
    },
  },
  args: {
    scenario: "campaignActive",
    initialPage: "home",
  },
} satisfies Meta<typeof UgcCreatorPrototype>

export default meta
type Story = StoryObj<typeof meta>

export const Explorador: Story = {
  name: "00 · Explorador interactivo",
}

export const SolicitudPendiente: Story = {
  name: "01 · Solicitud pendiente",
  args: { scenario: "applicationPending" },
}

export const SolicitudRechazada: Story = {
  name: "02 · Solicitud rechazada",
  args: { scenario: "applicationRejected" },
}

export const Onboarding: Story = {
  name: "03 · Checklist de onboarding",
  args: { scenario: "onboarding" },
}

export const ReunionPendiente: Story = {
  name: "04 · Reunión pendiente",
  args: { scenario: "meetingPending" },
}

export const ReunionReservada: Story = {
  name: "05 · Reunión reservada",
  args: { scenario: "meetingScheduled" },
}

export const PrimeraAusencia: Story = {
  name: "06 · Primera ausencia",
  args: { scenario: "meetingMissed" },
}

export const PreparacionDelTrial: Story = {
  name: "07 · Preparación del trial",
  args: { scenario: "trialPreparation" },
}

export const Calentamiento: Story = {
  name: "08 · Calentamiento",
  args: { scenario: "trialWarming" },
}

export const TrialActivo: Story = {
  name: "09 · Trial activo",
  args: { scenario: "trialPublishing" },
}

export const TrialEnRevision: Story = {
  name: "10 · Trial en revisión",
  args: { scenario: "trialReview" },
}

export const TrialNoSuperado: Story = {
  name: "11 · Trial no superado",
  args: { scenario: "trialNotPassed" },
}

export const EsperandoCampana: Story = {
  name: "12 · Esperando campaña",
  args: { scenario: "waitingCampaign" },
}

export const CampanaProgramada: Story = {
  name: "13 · Campaña programada",
  args: { scenario: "campaignScheduled" },
}

export const CampanaActiva: Story = {
  name: "14 · Campaña activa",
  args: { scenario: "campaignActive" },
}

export const CampanaEnRevision: Story = {
  name: "15 · Campaña en revisión",
  args: { scenario: "campaignReview" },
}

export const CampanaFinalizada: Story = {
  name: "16 · Campaña finalizada",
  args: { scenario: "campaignFinalized" },
}

export const CuentaSuspendida: Story = {
  name: "17 · Cuenta suspendida",
  args: { scenario: "suspended" },
}

export const CuentaCerrada: Story = {
  name: "18 · Cuenta cerrada",
  args: { scenario: "exited" },
}

export const HistorialDeVideos: Story = {
  name: "19 · Historial de vídeos",
  args: { scenario: "campaignActive", initialPage: "videos" },
}

export const Pagos: Story = {
  name: "20 · Pagos",
  args: { scenario: "campaignFinalized", initialPage: "payments" },
}

export const Perfil: Story = {
  name: "21 · Mi perfil",
  args: { scenario: "campaignActive", initialPage: "profile" },
}
