// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react"
import * as Option from "effect/Option"
import { describe, expect, it, vi } from "vitest"
import { CheckboxField, NumberField, TextField } from "./fields.js"
import { ProductI18nTestProvider } from "../../testing/product-i18n.js"

const state = <A,>(value: A, error: Option.Option<string> = Option.none()) => ({
  path: "field", value, error, isTouched: false, isValidating: false, isDirty: false,
  onChange: vi.fn(), onBlur: vi.fn(),
})

describe("web form field adapters", () => {
  it("connects text value, change, blur and accessible error", () => {
    const field = state("", Option.some("validation.email.required"))
    render(<ProductI18nTestProvider><TextField field={field} props={{ label: "Email" }} /></ProductI18nTestProvider>)
    const input = screen.getByRole("textbox", { name: "Email" })
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toBe("Introduce tu email")
    fireEvent.change(input, { target: { value: "a@b.com" } })
    fireEvent.blur(input)
    expect(field.onChange).toHaveBeenCalledWith("a@b.com")
    expect(field.onBlur).toHaveBeenCalledOnce()
  })

  it("maps number values", () => {
    const field = state(2000)
    render(<ProductI18nTestProvider><NumberField field={field} props={{ label: "Year" }} /></ProductI18nTestProvider>)
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "1999" } })
    expect(field.onChange).toHaveBeenCalledWith(1999)
  })

  it("maps checkbox values and disabled", () => {
    const field = state(false)
    render(<ProductI18nTestProvider><CheckboxField field={field} props={{ label: "Terms", disabled: true }} /></ProductI18nTestProvider>)
    expect((screen.getByRole("checkbox", { name: "Terms" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
