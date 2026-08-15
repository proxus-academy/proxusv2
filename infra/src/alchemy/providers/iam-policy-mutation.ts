import { Effect, Semaphore } from "effect"

/** Process-wide locks are shared by all provider/client instances in one Alchemy run. */
const locks = new Map<string, Semaphore.Semaphore>()
const lockFor = (resource: string) => {
  const current = locks.get(resource)
  if (current !== undefined) return current
  const created = Semaphore.makeUnsafe(1)
  locks.set(resource, created)
  return created
}

export interface PolicyConflictError { readonly code: string }

/** Serializes local writers and retries only optimistic-CAS conflicts, always from a fresh read. */
export const mutateIamPolicy = <P, E extends PolicyConflictError>(options: {
  readonly resource: string
  readonly read: () => Effect.Effect<P, E>
  readonly change: (policy: P) => P | undefined
  readonly write: (policy: P) => Effect.Effect<void, E>
  readonly maxAttempts?: number
}): Effect.Effect<void, E> => {
  const maxAttempts = options.maxAttempts ?? 4
  const attempt = (number: number): Effect.Effect<void, E> => options.read().pipe(
    Effect.flatMap((current) => {
      const changed = options.change(current)
      return changed === undefined ? Effect.void : options.write(changed)
    }),
    Effect.catchIf(
      (error) => error.code === "conflict" && number < maxAttempts,
      () => attempt(number + 1),
    ),
  )
  return lockFor(options.resource).withPermit(attempt(1))
}
