import { Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { HttpClient } from "effect/unstable/http"

/**
 * Stable Effect Atom runtime shared by the application's feature atoms.
 * Platform composition roots provide the concrete Effect HttpClient Layer.
 */
const ApplicationNotConfigured = Layer.effect(
  HttpClient.HttpClient,
  Effect.die(new Error("HttpClient is not configured for this AtomRegistry")),
)

export const applicationRuntime = Atom.runtime(ApplicationNotConfigured)
