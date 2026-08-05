import { Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { AppModel, PersistedSnapshot } from "./model.js"
import type { AppCommand, AppMessage } from "./update.js"
import { updateApp } from "./update.js"
import { formatAppRoute } from "./route.js"

export interface AppEnvironment {
  readonly loadSnapshot: Effect.Effect<PersistedSnapshot>
  readonly saveSnapshot: (snapshot: PersistedSnapshot) => Effect.Effect<void>
  readonly register: (draft: { readonly email: string; readonly displayName: string }) => Effect.Effect<void, string>
  readonly loadStudies: Effect.Effect<ReadonlyArray<{ readonly id: string; readonly name: string }>, string>
  readonly pushUrl: (url: string) => Effect.Effect<void>
  readonly replaceUrl: (url: string) => Effect.Effect<void>
}

const resultMessage = (command: AppCommand, environment: AppEnvironment): Effect.Effect<AppMessage | undefined> => {
  switch (command._tag) {
    case "LoadSnapshot":
      return Effect.map(environment.loadSnapshot, (snapshot) => ({ _tag: "SnapshotLoaded", snapshot }))
    case "SaveSnapshot":
      return Effect.as(environment.saveSnapshot(command.snapshot), undefined)
    case "Register":
      return environment.register(command.draft).pipe(
        Effect.as<AppMessage>({ _tag: "RegistrationSucceeded" }),
        Effect.catch((error) => Effect.succeed<AppMessage>({ _tag: "RegistrationFailed", error })),
      )
    case "LoadStudies":
      return environment.loadStudies.pipe(
        Effect.map((studies) => ({ _tag: "StudiesLoaded" as const, studies })),
        Effect.catch((error) => Effect.succeed<AppMessage>({ _tag: "StudiesLoadFailed", error })),
      )
    case "PushRoute":
      return Effect.as(environment.pushUrl(formatAppRoute(command.route)), undefined)
    case "ReplaceRoute":
      return Effect.as(environment.replaceUrl(formatAppRoute(command.route)), undefined)
  }
}

export const makeAppAtoms = (initialModel: AppModel, environment: AppEnvironment) => {
  const modelAtom = Atom.make(initialModel)
  const runtime = Atom.runtime(Layer.empty)

  const process = (message: AppMessage, get: Atom.FnContext): Effect.Effect<void> => {
    const [next, commands] = updateApp(get(modelAtom), message)
    get.set(modelAtom, next)
    return Effect.forEach(commands, (command) => resultMessage(command, environment), {
      concurrency: "unbounded",
    }).pipe(
      Effect.flatMap((messages) => Effect.forEach(
        messages,
        (result) => result === undefined ? Effect.void : process(result, get),
        { discard: true },
      )),
    )
  }

  const sendAtom = runtime.fn<AppMessage>()((message, get) => process(message, get))
  return { modelAtom, sendAtom }
}

export type AppAtoms = ReturnType<typeof makeAppAtoms>
