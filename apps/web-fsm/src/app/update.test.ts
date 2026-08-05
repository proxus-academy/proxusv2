import { describe, expect, it } from "vitest"
import { initialAppModel, updateApp } from "./update.js"

describe("web-fsm app update", () => {
  it("reconciles a protected dashboard cold load before rendering it", () => {
    const booting = initialAppModel({ _tag: "Dashboard" })
    const [model, commands] = updateApp(booting, { _tag: "SnapshotLoaded", snapshot: {} })
    expect(model._tag).toBe("Onboarding")
    expect(commands).toEqual([{ _tag: "ReplaceRoute", route: { _tag: "Registration" } }])
  })

  it("accepts dashboard when the persisted snapshot has a user", () => {
    const [model, commands] = updateApp(initialAppModel({ _tag: "Dashboard" }), {
      _tag: "SnapshotLoaded",
      snapshot: { user: { displayName: "Javi", email: "javi@example.com" } },
    })
    expect(model._tag).toBe("Dashboard")
    expect(commands).toEqual([{ _tag: "LoadStudies" }])
  })

  it("keeps invalid form state in the machine and emits no registration command", () => {
    const [onboarding] = updateApp(initialAppModel({ _tag: "Registration" }), { _tag: "SnapshotLoaded", snapshot: {} })
    const [model, commands] = updateApp(onboarding, { _tag: "RegistrationSubmitted" })
    expect(model._tag).toBe("Onboarding")
    if (model._tag !== "Onboarding" || model.registration._tag !== "Editing") throw new Error("expected editing")
    expect(model.registration.touched).toEqual(new Set(["email", "displayName"]))
    expect(model.registration.errors.email).toBeDefined()
    expect(commands).toEqual([])
  })

  it("moves valid registration through submitting into dashboard", () => {
    const [onboarding] = updateApp(initialAppModel({ _tag: "Registration" }), {
      _tag: "SnapshotLoaded",
      snapshot: { registrationDraft: { email: "javi@example.com", displayName: "Javi" } },
    })
    const [submitting, submitCommands] = updateApp(onboarding, { _tag: "RegistrationSubmitted" })
    expect(submitCommands[0]?._tag).toBe("Register")
    const [dashboard, successCommands] = updateApp(submitting, { _tag: "RegistrationSucceeded" })
    expect(dashboard._tag).toBe("Dashboard")
    expect(successCommands.map((command) => command._tag)).toEqual(["SaveSnapshot", "PushRoute", "LoadStudies"])
  })

  it("keeps previous query data visible while an invalidated query refreshes", () => {
    const dashboard = {
      _tag: "Dashboard" as const,
      user: { displayName: "Javi", email: "javi@example.com" },
      studies: { _tag: "Success" as const, studies: [{ id: "effect", name: "Effect" }] },
    }
    const [refreshing, commands] = updateApp(dashboard, { _tag: "StudiesInvalidated" })
    expect(refreshing).toEqual({ ...dashboard, studies: { _tag: "Refreshing", studies: dashboard.studies.studies } })
    expect(commands).toEqual([{ _tag: "LoadStudies" }])
  })
})
