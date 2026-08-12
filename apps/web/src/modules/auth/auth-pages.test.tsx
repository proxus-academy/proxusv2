// @vitest-environment happy-dom
import { RegistryProvider } from "@effect/atom-react"
import { currentSessionQuery } from "@proxus/frontend-core/auth"
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { makeWebRouter } from "../../routes/router.js"
import { LogoutButton } from "./auth-controls.js"
import { ProductI18nTestProvider } from "../../testing/product-i18n.js"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// @effect-diagnostics-next-line asyncFunction:off
const renderRoute = async (path: string) => {
  const host = document.createElement("div")
  const root = createRoot(host)
  const router = makeWebRouter(createMemoryHistory({ initialEntries: [path] }))
  await act(async () => {
    root.render(<RegistryProvider initialValues={[[currentSessionQuery, AsyncResult.success(null)]]}><RouterProvider router={router} /></RegistryProvider>)
    await router.load()
  })
  return { host, root, router }
}

describe("public auth pages", () => {
  // @effect-diagnostics-next-line asyncFunction:off
  it("offers email and Google login", async () => {
    const { host, root } = await renderRoute("/es/login")
    expect(host.textContent).toContain("Inicia sesión")
    expect(host.textContent).toContain("Continuar con Google")
    expect(host.textContent).toContain("Crear una cuenta")
    act(() => root.unmount())
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("renders the same auth surface in English", async () => {
    const { host, root } = await renderRoute("/en/login")
    expect(host.textContent).toContain("Sign in")
    expect(host.textContent).toContain("Continue with Google")
    expect(host.textContent).toContain("Create an account")
    act(() => root.unmount())
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("provides recovery, new-password and logout modules", async () => {
    for (const [path, text] of [
      ["/es/password-recovery", "respuesta será siempre la misma"],
      ["/es/password-recovery/code", "Reenviar código"],
      ["/es/password-recovery/new-password", "Confirmar contraseña"],
    ] as const) {
      const { host, root } = await renderRoute(path)
      expect(host.textContent).toContain(text)
      act(() => root.unmount())
    }
    expect(renderToStaticMarkup(<ProductI18nTestProvider><LogoutButton onLogout={vi.fn()} /></ProductI18nTestProvider>)).toContain("Cerrar sesión")
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("resets field identity when email and code routes replace each other", async () => {
    const { host, root, router } = await renderRoute("/es/password-recovery")
    expect(host.querySelector<HTMLInputElement>('input[name="email"]')?.value).toBe("")
    await act(() => router.navigate({ to: "/$locale/password-recovery/code", params: { locale: "es" } }))
    expect(host.querySelector<HTMLInputElement>('input[name="code"]')?.value).toBe("")
    act(() => root.unmount())
  })
})
