import { RegistrationCta, type FeatureFlagBootstrap } from "@proxus/shared/feature-flags"
import * as Cause from "effect/Cause"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeFeatureFlagDecisionAtom } from "./atoms.js"

const validSubject = "00000000-0000-4000-8000-000000000002"

describe("feature flag decision atom", () => {
  it("preserves bootstrap loading, failure, and success", () => {
    const registry = AtomRegistry.make()
    const bootstrapAtom = Atom.make<AsyncResult.AsyncResult<FeatureFlagBootstrap, string>>(
      AsyncResult.initial(true),
    )
    const decisionAtom = makeFeatureFlagDecisionAtom({ definition: RegistrationCta, bootstrapAtom })

    expect(registry.get(decisionAtom)).toMatchObject({ _tag: "Initial", waiting: true })

    registry.set(bootstrapAtom, AsyncResult.failure(Cause.fail("offline")))
    expect(registry.get(decisionAtom)).toMatchObject({ _tag: "Failure" })

    registry.set(bootstrapAtom, AsyncResult.success({ subjectId: validSubject }))
    expect(registry.get(decisionAtom)).toMatchObject({
      _tag: "Success",
      value: { value: "benefitCopy", source: "allocation" },
    })
  })

  it("keeps the safe default only inside a successful bootstrap", () => {
    const registry = AtomRegistry.make()
    const bootstrapAtom = Atom.make(AsyncResult.success<FeatureFlagBootstrap>({ subjectId: null }))
    const decisionAtom = makeFeatureFlagDecisionAtom({ definition: RegistrationCta, bootstrapAtom })
    expect(registry.get(decisionAtom)).toMatchObject({
      _tag: "Success",
      value: { value: "control", source: "default" },
    })
  })

  it("applies session overrides only when explicitly enabled", () => {
    const bootstrapAtom = Atom.make(AsyncResult.success<FeatureFlagBootstrap>({ subjectId: validSubject }))
    const devOverrideAtom = Atom.make<"control" | "benefitCopy" | null>("control")
    const registry = AtomRegistry.make()
    const production = makeFeatureFlagDecisionAtom({ definition: RegistrationCta, bootstrapAtom, devOverrideAtom })
    const development = makeFeatureFlagDecisionAtom({
      definition: RegistrationCta,
      bootstrapAtom,
      devOverrideAtom,
      enableDevOverrides: true,
    })

    expect(AsyncResult.getOrThrow(registry.get(production)).source).toBe("allocation")
    expect(AsyncResult.getOrThrow(registry.get(development))).toMatchObject({
      value: "control",
      source: "dev-override",
    })
  })

  it("keeps independent bootstrap inputs isolated", () => {
    const registry = AtomRegistry.make()
    const firstBootstrap = Atom.make(AsyncResult.success<FeatureFlagBootstrap>({ subjectId: null }))
    const secondBootstrap = Atom.make(AsyncResult.success<FeatureFlagBootstrap>({ subjectId: validSubject }))
    const first = makeFeatureFlagDecisionAtom({ definition: RegistrationCta, bootstrapAtom: firstBootstrap })
    const second = makeFeatureFlagDecisionAtom({ definition: RegistrationCta, bootstrapAtom: secondBootstrap })

    registry.set(firstBootstrap, AsyncResult.success({ subjectId: "00000000-0000-4000-8000-000000000001" }))
    expect(AsyncResult.getOrThrow(registry.get(first)).value).toBe("control")
    expect(AsyncResult.getOrThrow(registry.get(second)).value).toBe("benefitCopy")
  })
})
