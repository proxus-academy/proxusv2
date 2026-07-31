// @vitest-environment happy-dom
import { OtpInput } from "@proxus/ui"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
})

describe("OtpInput", () => {
  it("distributes pasted digits and completes only once per value", () => {
    const completed = vi.fn()
    function Fixture() {
      const [value, setValue] = useState("")
      return <OtpInput value={value} onChange={setValue} onComplete={completed} />
    }
    act(() => root.render(<Fixture />))
    const inputs = host.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]')
    const paste = () => {
      const event = new Event("paste", { bubbles: true })
      Object.defineProperty(event, "clipboardData", { value: { getData: () => "123456" } })
      inputs[0]?.dispatchEvent(event)
    }
    act(paste)
    expect([...inputs].map(({ value }) => value).join("")).toBe("123456")
    expect(completed).toHaveBeenCalledTimes(1)
    act(paste)
    expect(completed).toHaveBeenCalledTimes(1)
  })

  it("moves backwards and removes the previous digit on backspace", () => {
    function Fixture() {
      const [value, setValue] = useState("12")
      return <OtpInput value={value} onChange={setValue} />
    }
    act(() => root.render(<Fixture />))
    const inputs = host.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]')
    inputs[2]?.focus()
    act(() => { inputs[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true })) })
    expect([...inputs].map(({ value }) => value).join("")).toBe("1")
    expect(document.activeElement).toBe(inputs[1])
  })
})
