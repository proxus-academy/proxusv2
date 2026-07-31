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
  it("reacts to matchMedia changes", () => {
    let matches = false
    let listener: EventListenerOrEventListenerObject | undefined
    vi.spyOn(globalThis.window, "matchMedia").mockImplementation((media) => ({
      media,
      get matches() { return matches },
      onchange: null,
      addEventListener: (_type: string, next: EventListenerOrEventListenerObject) => { listener = next },
      removeEventListener: () => { listener = undefined },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }))
    function Fixture() {
      return <span>{useDesktopViewport() ? "desktop" : "mobile"}</span>
    }
    act(() => root.render(<Fixture />))
    expect(host.textContent).toBe("mobile")
    matches = true
    act(() => {
      if (typeof listener === "function") listener(new Event("change"))
      else listener?.handleEvent(new Event("change"))
    })
    expect(host.textContent).toBe("desktop")
  })
})
