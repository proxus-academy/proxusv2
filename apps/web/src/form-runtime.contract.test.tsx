// @vitest-environment happy-dom
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { LoginForm } from "./modules/auth/forms.js"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function ContractProbe() {
  useAtomSet(LoginForm.submit)
  return <LoginForm.Initialize defaultValues={{ email: "", password: "" }}><LoginForm.KeepAlive /><span>registry-ready</span></LoginForm.Initialize>
}

describe("Effect Form runtime contract", () => {
  it("mounts Proxus forms in the canonical RegistryProvider", () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    act(() => { root.render(<RegistryProvider><ContractProbe /></RegistryProvider>) })
    expect(host.textContent).toContain("registry-ready")
    act(() => root.unmount())
  })
})
