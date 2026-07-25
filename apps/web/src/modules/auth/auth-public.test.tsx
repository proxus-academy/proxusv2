// @vitest-environment happy-dom
import { RegistryProvider } from "@effect/atom-react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { CodeView, ForgotPasswordView, LogoutButton, NewPasswordView } from "./auth-public.js"
import { LoginPage } from "./login-page.js"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const back = vi.fn()

describe("public auth pages", () => {
  it("offers email and Google login", () => {
    const html = renderToStaticMarkup(<RegistryProvider><LoginPage /></RegistryProvider>)
    expect(html).toContain("Inicia sesión")
    expect(html).toContain("Continuar con Google")
    expect(html).toContain("Crear una cuenta")
  })

  it("renders recovery resend cooldowns", () => {
    const pending = renderToStaticMarkup(<CodeView pending email="s***@example.com" cooldownSeconds={24} onCode={vi.fn()} onResend={vi.fn()} onBackToLogin={back} />)
    const code = renderToStaticMarkup(<CodeView cooldownSeconds={0} onCode={vi.fn()} onResend={vi.fn()} onBackToLogin={back} />)
    expect(pending).toContain("Tu cuenta está pendiente")
    expect(pending).toContain("Reenviar en 24s")
    expect(pending).toContain("disabled")
    expect(code).toContain("Reenviar código")
  })

  it("resets field identity when email and code pages replace each other", () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    act(() => root.render(<ForgotPasswordView email="student@example.com" onSubmit={vi.fn()} onBackToLogin={back} />))
    expect(host.querySelector<HTMLInputElement>('input[name="email"]')?.value).toBe("student@example.com")
    act(() => root.render(<CodeView email="student@example.com" onCode={vi.fn()} onResend={vi.fn()} onBackToLogin={back} />))
    expect(host.querySelector<HTMLInputElement>('input[name="code"]')?.value).toBe("")
    act(() => root.unmount())
  })

  it("provides forgot, new-password and logout modules", () => {
    expect(renderToStaticMarkup(<ForgotPasswordView onSubmit={vi.fn()} onBackToLogin={back} />)).toContain("respuesta será siempre la misma")
    expect(renderToStaticMarkup(<NewPasswordView onSubmit={vi.fn()} onBackToLogin={back} />)).toContain("Confirmar contraseña")
    expect(renderToStaticMarkup(<LogoutButton onLogout={vi.fn()} />)).toContain("Cerrar sesión")
  })
})
