import { Effect, Schema } from "effect"
import type { AppEnvironment } from "../app/runtime.js"

const storageKey = "proxus.web-fsm.snapshot.v1"
const PersistedSnapshotJson = Schema.fromJsonString(Schema.Struct({
  registrationDraft: Schema.optional(Schema.Struct({
    email: Schema.String,
    displayName: Schema.String,
  })),
  user: Schema.optional(Schema.Struct({
    email: Schema.String,
    displayName: Schema.String,
  })),
}))
const decodeSnapshot = Schema.decodeUnknownSync(PersistedSnapshotJson)
const encodeSnapshot = Schema.encodeSync(PersistedSnapshotJson)

const loadSnapshot = Effect.sync(() => {
  const value = window.localStorage.getItem(storageKey)
  if (value === null) return {}
  try {
    return decodeSnapshot(value)
  } catch {
    return {}
  }
})

export const browserEnvironment: AppEnvironment = {
  loadSnapshot,
  saveSnapshot: (snapshot) => Effect.sync(() => window.localStorage.setItem(storageKey, encodeSnapshot(snapshot))),
  register: () => Effect.sleep("500 millis"),
  loadStudies: Effect.sleep("350 millis").pipe(Effect.as([
    { id: "effect", name: "Effect para aplicaciones mantenibles" },
    { id: "state-machines", name: "Máquinas de estados y sistemas reactivos" },
  ])),
  pushUrl: (url) => Effect.sync(() => window.history.pushState(null, "", url)),
  replaceUrl: (url) => Effect.sync(() => window.history.replaceState(null, "", url)),
}
