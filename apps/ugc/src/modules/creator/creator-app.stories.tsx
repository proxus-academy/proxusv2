import { RegistryProvider } from "@effect/atom-react"
import { ugcCommandAction, ugcWorkspaceQuery } from "@proxus/frontend-core/ugc-management"
import { CurrentSession } from "@proxus/shared/auth"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useState } from "react"
import { PortalShell } from "../shell/portal-shell.js"
import { CreatorHomeScreen } from "./home-screen.js"
import { PaymentsScreen } from "./payments-screen.js"
import { ProfileScreen } from "./profile-screen.js"
import { VideosScreen } from "./videos-screen.js"
import { creatorAppScenarioLabels, creatorWorkspaceFor, type CreatorAppScenario } from "./creator-app.fixtures.js"

const scenarios = [
  "application",
  "applicationPending",
  "applicationRejected",
  "onboarding",
  "contractReady",
  "meetingPending",
  "meetingScheduled",
  "trialWarming",
  "trialPublishing",
  "trialReview",
  "disqualified",
  "waitingCampaign",
  "campaignScheduled",
  "campaignActive",
  "campaignReview",
  "suspended",
  "exited",
  "videos",
  "payments",
  "profile",
] satisfies ReadonlyArray<CreatorAppScenario>
const storySession = Schema.decodeUnknownSync(CurrentSession)({
  sessionId: "00000000-0000-4000-8000-000000000002",
  account: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "lucia@proxus.test",
    username: "lucia_creator",
    status: "active",
    provider: "email",
  },
  expiresAt: "2030-01-01T00:00:00.000Z",
})

function makeStoryRouter(initialPath: string) {
  const rootRoute = createRootRoute({ component: Outlet })
  const shellRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "ugc",
    component: () => <PortalShell session={storySession}><Outlet /></PortalShell>,
  })
  const homeRoute = createRoute({ getParentRoute: () => shellRoute, path: "/", component: CreatorHomeScreen })
  const videosRoute = createRoute({ getParentRoute: () => shellRoute, path: "videos", component: VideosScreen })
  const paymentsRoute = createRoute({ getParentRoute: () => shellRoute, path: "payments", component: PaymentsScreen })
  const profileRoute = createRoute({ getParentRoute: () => shellRoute, path: "profile", component: ProfileScreen })
  const managerRoute = createRoute({ getParentRoute: () => shellRoute, path: "manager", component: CreatorHomeScreen })
  const routeTree = rootRoute.addChildren([shellRoute.addChildren([homeRoute, videosRoute, paymentsRoute, profileRoute, managerRoute])])
  return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initialPath] }) })
}

function CreatorApplicationStory({ scenario }: { readonly scenario: CreatorAppScenario }) {
  const workspace = creatorWorkspaceFor(scenario)
  const initialPath = scenario === "videos" ? "/ugc/videos" : scenario === "payments" ? "/ugc/payments" : scenario === "profile" ? "/ugc/profile" : "/ugc"
  const [router] = useState(() => makeStoryRouter(initialPath))
  return <RegistryProvider initialValues={[
    [ugcWorkspaceQuery, AsyncResult.success(workspace)],
    [ugcCommandAction, AsyncResult.initial()],
  ]}><RouterProvider router={router} /></RegistryProvider>
}

const meta = {
  title: "Aplicacion/UGC Creator real",
  component: CreatorApplicationStory,
  parameters: { layout: "fullscreen" },
  argTypes: { scenario: { control: "select", options: scenarios, labels: creatorAppScenarioLabels } },
  args: { scenario: "campaignActive" },
  render: (args) => <CreatorApplicationStory key={args.scenario} {...args} />,
} satisfies Meta<typeof CreatorApplicationStory>

export default meta
type Story = StoryObj<typeof meta>

export const RegistroContacto: Story = { name: "01 · Registro de contacto", args: { scenario: "application" } }
export const SolicitudPendiente: Story = { name: "02 · Solicitud pendiente", args: { scenario: "applicationPending" } }
export const SolicitudRechazada: Story = { name: "03 · Solicitud rechazada", args: { scenario: "applicationRejected" } }
export const Onboarding: Story = { name: "04 · Checklist de onboarding", args: { scenario: "onboarding" } }
export const ContratoListo: Story = { name: "05 · Contrato listo para firmar", args: { scenario: "contractReady" } }
export const ReunionPendiente: Story = { name: "06 · Reserva de reunión", args: { scenario: "meetingPending" } }
export const ReunionReservada: Story = { name: "07 · Reunión reservada", args: { scenario: "meetingScheduled" } }
export const Calentamiento: Story = { name: "08 · Calentamiento", args: { scenario: "trialWarming" } }
export const TrialActivo: Story = { name: "09 · Trial activo", args: { scenario: "trialPublishing" } }
export const TrialEnRevision: Story = { name: "10 · Trial en revisión", args: { scenario: "trialReview" } }
export const TrialNoSuperado: Story = { name: "11 · Trial no superado", args: { scenario: "disqualified" } }
export const EsperandoCampana: Story = { name: "12 · Esperando campaña", args: { scenario: "waitingCampaign" } }
export const CampanaProgramada: Story = { name: "13 · Campaña programada", args: { scenario: "campaignScheduled" } }
export const CampanaActiva: Story = { name: "14 · Campaña activa", args: { scenario: "campaignActive" } }
export const CampanaEnRevision: Story = { name: "15 · Campaña en revisión", args: { scenario: "campaignReview" } }
export const CuentaSuspendida: Story = { name: "16 · Cuenta suspendida", args: { scenario: "suspended" } }
export const CuentaCerrada: Story = { name: "17 · Cuenta cerrada", args: { scenario: "exited" } }
export const HistorialDeVideos: Story = { name: "18 · Historial de vídeos", args: { scenario: "videos" } }
export const Pagos: Story = { name: "19 · Pagos", args: { scenario: "payments" } }
export const Perfil: Story = { name: "20 · Perfil", args: { scenario: "profile" } }
