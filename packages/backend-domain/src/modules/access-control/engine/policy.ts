/**
 * Adapted from effect-access 0.1.0, commit 134768b.
 * Copyright JavierDeDiegoGuzman. See THIRD_PARTY_NOTICES.md.
 */
import { Effect } from "effect"
import { Forbidden, forbidden } from "./forbidden.js"

export type Policy<Error = never, Requirements = never> = Effect.Effect<void, Forbidden | Error, Requirements>

export const guard = <Error, Requirements>(policy: Policy<Error, Requirements>) =>
  <A, Error2, Requirements2>(self: Effect.Effect<A, Error2, Requirements2>): Effect.Effect<A, Error | Error2 | Forbidden, Requirements | Requirements2> =>
    Effect.flatMap(policy, () => self)

type PolicyErrorOf<P> = P extends Policy<infer Error, unknown> ? Error : never
type PolicyRequirementsOf<P> = P extends Policy<unknown, infer Requirements> ? Requirements : never

type CombinedPolicy<Policies extends readonly Policy<unknown, unknown>[]> = Policy<
  PolicyErrorOf<Policies[number]>,
  PolicyRequirementsOf<Policies[number]>
>

// The generic combinators preserve each input policy's error and requirements.
// @effect-diagnostics anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off
export function all<const Policies extends readonly Policy<unknown, unknown>[]>(...policies: Policies): CombinedPolicy<Policies>
export function all(...policies: readonly Policy<unknown, unknown>[]): Policy<unknown, unknown> {
  return Effect.all(policies, { concurrency: 1, discard: true })
}

/** Tries alternatives in order. Only Forbidden is recoverable; operational errors fail immediately. */
// @effect-diagnostics anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off
export function any<const Policies extends readonly Policy<unknown, unknown>[]>(...policies: Policies): CombinedPolicy<Policies>
export function any(...policies: readonly Policy<unknown, unknown>[]): Policy<unknown, unknown> {
  const loop = (index: number, reasons: readonly Forbidden[]): Policy<unknown, unknown> => {
    const policy = policies[index]
    if (policy === undefined) {
      return Effect.fail(forbidden({ message: "No policy matched", reasons }))
    }
    return Effect.catch(policy, (error) =>
      error instanceof Forbidden ? loop(index + 1, [...reasons, error]) : Effect.fail(error)
    )
  }
  return loop(0, [])
}

export const toBool = <Error, Requirements>(
  policy: Policy<Error, Requirements>
): Effect.Effect<boolean, Error, Requirements> =>
  Effect.matchEffect(policy, {
    onSuccess: () => Effect.succeed(true),
    onFailure: (error) => error instanceof Forbidden ? Effect.succeed(false) : Effect.fail(error)
  })
