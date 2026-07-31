import { Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PublicApiClient } from "./public-api/client.js"

/**
 * Stable Effect Atom runtime shared by the application's feature atoms.
 * Platform composition roots provide a configured typed public client.
 */
const ApplicationNotConfigured = Layer.effect(
  PublicApiClient,
  Effect.die(new Error("PublicApiClient is not configured for this AtomRegistry")),
)

export const applicationRuntime = Atom.runtime(ApplicationNotConfigured)
