import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import { editingRegistration, type AppModel } from "../app/model.js"
import { AppView } from "./app-view.js"
import "../styles.css"

const meta = {
  title: "Web FSM/AppView",
  component: AppView,
  args: { send: fn() },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppView>

export default meta
type Story = StoryObj<typeof meta>

const onboardingModel: AppModel = {
  _tag: "Onboarding",
  registration: editingRegistration({ email: "", displayName: "" }),
}

export const Booting: Story = { args: { model: { _tag: "Booting", requestedRoute: { _tag: "Root" } } } }
export const Onboarding: Story = { args: { model: onboardingModel } }
export const InvalidForm: Story = { args: { model: { _tag: "Onboarding", registration: {
  _tag: "Editing", draft: { email: "no-es-un-email", displayName: "J" },
  touched: new Set(["email", "displayName"]),
  errors: { email: "Introduce un email válido.", displayName: "El nombre debe tener al menos dos caracteres." },
} } } }
export const Submitting: Story = { args: { model: { _tag: "Onboarding", registration: {
  _tag: "Submitting", draft: { email: "javi@example.com", displayName: "Javi" },
} } } }
export const SubmissionFailed: Story = { args: { model: { _tag: "Onboarding", registration: {
  _tag: "Failed", draft: { email: "javi@example.com", displayName: "Javi" }, error: "No se pudo crear la cuenta.",
} } } }
export const DashboardLoading: Story = { args: { model: { _tag: "Dashboard", user: { displayName: "Javi", email: "javi@example.com" }, studies: { _tag: "Loading" } } } }
export const Dashboard: Story = { args: { model: { _tag: "Dashboard", user: { displayName: "Javi", email: "javi@example.com" }, studies: { _tag: "Success", studies: [{ id: "effect", name: "Effect para aplicaciones mantenibles" }] } } } }
export const DashboardRefreshing: Story = { args: { model: { _tag: "Dashboard", user: { displayName: "Javi", email: "javi@example.com" }, studies: { _tag: "Refreshing", studies: [{ id: "effect", name: "Effect para aplicaciones mantenibles" }] } } } }
export const NotFound: Story = { args: { model: { _tag: "NotFound", path: "/esto-no-existe" } } }
