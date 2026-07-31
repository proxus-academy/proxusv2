// @vitest-environment happy-dom
import { RegistryProvider } from "@effect/atom-react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { LoginPage } from "./login-page.js"
import { NewPasswordPage } from "./new-password-page.js"
import { PasswordRecoveryPage } from "./password-recovery-page.js"
import { RecoveryCodePage } from "./recovery-code-page.js"
import { LogoutButton } from "../../modules/auth/auth-controls.js"
import { ProductI18nTestProvider } from "../../testing/product-i18n.js"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const renderPage = (page: React.ReactNode, locale: "es" | "en" = "es") => renderToStaticMarkup(
  <ProductI18nTestProvider locale={locale}><RegistryProvider>{page}</RegistryProvider></ProductI18nTestProvider>,
)

describe("public auth pages", () => {
  it("offers email and Google login", () => {
    const html = renderPage(<LoginPage />)
    expect(html).toContain("Inicia sesión")
    expect(html).toContain("Continuar con Google")
    expect(html).toContain("Crear una cuenta")
  })

  it("renders the same auth surface in English", () => {
    const html = renderPage(<LoginPage />, "en")
    expect(html).toContain("Sign in")
    expect(html).toContain("Continue with Google")
    expect(html).toContain("Create an account")
  })

  it("provides recovery, new-password and logout modules", () => {
    expect(renderPage(<PasswordRecoveryPage />)).toContain("respuesta será siempre la misma")
    expect(renderPage(<RecoveryCodePage />)).toContain("Reenviar código")
    expect(renderPage(<NewPasswordPage />)).toContain("Confirmar contraseña")
    expect(renderToStaticMarkup(<ProductI18nTestProvider><LogoutButton onLogout={vi.fn()} /></ProductI18nTestProvider>)).toContain("Cerrar sesión")
  })

  it("resets field identity when email and code pages replace each other", () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    act(() => root.render(<ProductI18nTestProvider><RegistryProvider><PasswordRecoveryPage /></RegistryProvider></ProductI18nTestProvider>))
    expect(host.querySelector<HTMLInputElement>('input[name="email"]')?.value).toBe("")
    act(() => root.render(<ProductI18nTestProvider><RegistryProvider><RecoveryCodePage /></RegistryProvider></ProductI18nTestProvider>))
    expect(host.querySelector<HTMLInputElement>('input[name="code"]')?.value).toBe("")
    act(() => root.unmount())
  })
})
