import { Field, Form, FormBuilder, FormReact } from "@proxus/effect-form/react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

const Input: FormReact.FieldComponent<string> = ({ field }) => <input aria-label="name" value={field.value} onChange={(event) => field.onChange(event.currentTarget.value)} onBlur={field.onBlur} />

const setup = (onSubmit = vi.fn()) => {
  const builder = FormBuilder.empty.addField(Field.makeField("name", Schema.String))
  const form = Form.make(builder, { mode: { validation: "onSubmit" }, onSubmit: (_: void, { decoded }) => onSubmit(decoded) })
  const View = FormReact.make(form, { fields: { name: Input } })
  return { form, View, onSubmit }
}

describe("FormReact compounds", () => {
  it("renders a form, prevents default and submits valid values", async () => {
    const { View, onSubmit } = setup()
    render(<View.Provider defaultValues={{ name: "Ada" }}><View.Form aria-label="profile"><View.name /><View.Submit asChild><button>Save</button></View.Submit></View.Form></View.Provider>)
    const htmlForm = screen.getByRole("form")
    const event = new Event("submit", { bubbles: true, cancelable: true })
    htmlForm.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "Ada" }))
  })

  it("associates Submit outside the form using the private form id", async () => {
    const { View, onSubmit } = setup()
    render(<View.Provider defaultValues={{ name: "Ada" }}><View.Form aria-label="profile"><View.name /></View.Form><View.Submit asChild><button>Save</button></View.Submit></View.Provider>)
    const button = screen.getByRole("button", { name: "Save" })
    const htmlForm = screen.getByRole("form")
    expect(button).toHaveAttribute("form", htmlForm.id)
    expect(button).toHaveAttribute("type", "submit")
    fireEvent.click(button)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
  })

  it("ignores a second submit while the first one is waiting", async () => {
    const onSubmit = vi.fn(() => Effect.sleep("50 millis"))
    const builder = FormBuilder.empty.addField(Field.makeField("name", Schema.String))
    const form = Form.make(builder, { onSubmit: onSubmit as (_: void) => Effect.Effect<void> })
    const View = FormReact.make(form, { fields: { name: Input } })
    render(<View.Provider defaultValues={{ name: "Ada" }}><View.Form aria-label="profile"><View.name /></View.Form></View.Provider>)
    const htmlForm = screen.getByRole("form")
    fireEvent.submit(htmlForm)
    fireEvent.submit(htmlForm)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
  })

  it("rejects Form and Submit outside their binding Provider", () => {
    const { View } = setup()
    expect(() => render(<View.Form />)).toThrow(/inside the Provider/)
    expect(() => render(<View.Submit asChild><button>Save</button></View.Submit>)).toThrow(/inside the Provider/)
  })

  it("does not allow compounds to consume a different binding context", () => {
    const { View: First } = setup()
    const { View: Second } = setup()
    expect(() => render(<First.Provider defaultValues={{ name: "" }}><Second.Form /></First.Provider>)).toThrow(/same FormReact\.make call/)
  })
})
