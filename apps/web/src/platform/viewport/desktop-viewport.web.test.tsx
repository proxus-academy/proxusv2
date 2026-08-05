// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useDesktopViewport } from "./desktop-viewport.web.js"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe("desktop viewport adapter", () => {
  const renderViewport = (matches: Record<string, boolean>) => {
    const listeners = new Map<string, EventListenerOrEventListenerObject>()
    vi.spyOn(globalThis.window, "matchMedia").mockImplementation((media) => ({
      media,
      get matches() { return matches[media] ?? false },
      onchange: null,
      addEventListener: (_type: string, next: EventListenerOrEventListenerObject) => { listeners.set(media, next) },
      removeEventListener: () => { listeners.delete(media) },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }))
    function Fixture() {
      return <span>{useDesktopViewport() ? "desktop" : "mobile"}</span>
    }
    act(() => root.render(<Fixture />))
    return {
      notify: (media: string) => {
        const listener = listeners.get(media)
        act(() => {
          if (typeof listener === "function") listener(new Event("change"))
          else listener?.handleEvent(new Event("change"))
        })
      },
    }
  }

  it("keeps the web app in a narrow desktop split", () => {
    renderViewport({
      "(max-width: 1023px)": true,
      "(any-pointer: coarse)": false,
    })
    expect(host.textContent).toBe("desktop")
  })

  it("shows the mobile experience only for narrow touch devices", () => {
    renderViewport({
      "(max-width: 1023px)": true,
      "(any-pointer: coarse)": true,
    })
    expect(host.textContent).toBe("mobile")
  })

  it("reacts when the viewport is resized", () => {
    const matches: Record<string, boolean> = {
      "(max-width: 1023px)": true,
      "(any-pointer: coarse)": true,
    }
    const viewport = renderViewport(matches)
    expect(host.textContent).toBe("mobile")
    matches["(max-width: 1023px)"] = false
    viewport.notify("(max-width: 1023px)")
    expect(host.textContent).toBe("desktop")
  })

  it("keeps the web app on a wide touch-capable display", () => {
    renderViewport({
      "(max-width: 1023px)": false,
      "(any-pointer: coarse)": true,
    })
    expect(host.textContent).toBe("desktop")
  })
})
