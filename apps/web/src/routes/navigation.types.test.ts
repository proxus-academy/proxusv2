import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { navigateAction, type NavigationDestination } from "./navigation.js"

describe("typed product navigation", () => {
  it("accepts only declared destinations and options", () => {
    const destination = {
      id: "password-recovery-code",
      replace: true,
    } as const satisfies NavigationDestination
    expect(destination).toEqual({ id: "password-recovery-code", replace: true })

    if (false) {
      const registry = AtomRegistry.make()
      registry.set(navigateAction, { id: "login" })
      // @ts-expect-error unknown route identifier
      registry.set(navigateAction, { id: "settings" })
      // @ts-expect-error destination-specific input cannot be invented
      registry.set(navigateAction, { id: "home", studyId: "unexpected" })
      // @ts-expect-error replace is boolean
      registry.set(navigateAction, { id: "registration", replace: "yes" })
    }
  })
})
