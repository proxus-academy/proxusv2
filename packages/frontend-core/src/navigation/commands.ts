import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

interface FailedCommand {
  readonly token: object
  readonly effect: Effect.Effect<void>
}

export interface RetryableCommandRunner {
  readonly run: <A, E>(
    get: Atom.FnContext,
    effect: Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>
}

export interface RetryableCommands extends RetryableCommandRunner {
  readonly failedAtom: Atom.Atom<boolean>
  readonly retryAtom: Atom.AtomResultFn<void, void>
}

/** Retains and retries only the latest-started command that fails. */
export const makeRetryableCommands = (): RetryableCommands => {
  const lastFailedAtom = Atom.make<FailedCommand | undefined>(undefined)
  const latestStartedTokenAtom = Atom.make<object | undefined>(undefined).pipe(
    Atom.keepAlive,
  )

  const run = <A, E>(
    get: Atom.FnContext,
    effect: Effect.Effect<A, E>,
  ): Effect.Effect<A, E> => {
    const token = {}
    const start = Effect.sync(() => {
      get.set(latestStartedTokenAtom, token)
    })
    const clear = Effect.sync(() => {
      if (get(latestStartedTokenAtom) === token) {
        get.set(lastFailedAtom, undefined)
      }
    })
    let retryEffect: Effect.Effect<void>
    const remember = Effect.sync(() => {
      if (get(latestStartedTokenAtom) === token) {
        get.set(lastFailedAtom, { token, effect: retryEffect })
      }
    })
    const observed = start.pipe(
      Effect.andThen(effect),
      Effect.tap(() => clear),
      Effect.tapError(() => remember),
    )
    retryEffect = Effect.suspend(() => observed.pipe(Effect.asVoid, Effect.ignore))
    return observed
  }

  const failedAtom = Atom.make((get) => get(lastFailedAtom) !== undefined)
  const retryAtom = Atom.fn((_input: void, get) =>
    get(lastFailedAtom)?.effect ?? Effect.void)

  return { run, failedAtom, retryAtom }
}
