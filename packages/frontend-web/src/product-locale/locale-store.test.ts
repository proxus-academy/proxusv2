// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeBrowserLocaleStore } from "./locale-store.js"

beforeEach(() => {
  localStorage.clear()
  history.replaceState({ preserved: true }, "", "/register?path=kept#summary")
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["es-ES"] })
})

afterEach(() => vi.restoreAllMocks())

describe("browser locale store", () => {
  it("resolves URL before preference and browser locale", () => {
    localStorage.setItem("proxus.product-locale.v1", JSON.stringify({ version: 1, locale: "es" }))
    history.replaceState(history.state, "", "/register?lang=en&path=kept#summary")
    const store = makeBrowserLocaleStore()

    expect(store.getSnapshot()).toBe("en")
    expect(document.documentElement.lang).toBe("en")
    expect(document.documentElement.dir).toBe("ltr")
    store.dispose()
  })

  it("removes an invalid URL locale without creating history or dropping URL state", () => {
    history.replaceState(history.state, "", "/register?lang=fr&path=kept#summary")
    const replaceState = vi.spyOn(history, "replaceState")

    const store = makeBrowserLocaleStore()

    const url = new URL(location.href)
    expect(store.getSnapshot()).toBe("es")
    expect(url.searchParams.has("lang")).toBe(false)
    expect(url.searchParams.get("path")).toBe("kept")
    expect(url.hash).toBe("#summary")
    expect(history.state).toEqual({ preserved: true })
    expect(replaceState).toHaveBeenCalledOnce()
    store.dispose()
  })

  it("persists a selection without dropping URL state", () => {
    const store = makeBrowserLocaleStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.select("en")

    const url = new URL(location.href)
    expect(store.getSnapshot()).toBe("en")
    expect(url.searchParams.get("lang")).toBe("en")
    expect(url.searchParams.get("path")).toBe("kept")
    expect(url.hash).toBe("#summary")
    expect(history.state).toEqual({ preserved: true })
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    store.dispose()
  })

  it("reacts to history locale changes without overwriting the preference", () => {
    localStorage.setItem("proxus.product-locale.v1", JSON.stringify({ version: 1, locale: "es" }))
    const store = makeBrowserLocaleStore()

    history.pushState(history.state, "", "/register?lang=en&path=kept#summary")
    window.dispatchEvent(new PopStateEvent("popstate"))

    expect(store.getSnapshot()).toBe("en")
    expect(JSON.parse(localStorage.getItem("proxus.product-locale.v1") ?? "null")).toEqual({
      version: 1,
      locale: "es",
    })
    store.dispose()
  })
})
