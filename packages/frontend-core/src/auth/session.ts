import { publicApiClient } from "../public-api/client.js"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { applicationRuntime } from "../runtime.js"

/** The server session is authoritative; an expired or missing cookie is anonymous. */
export const currentSessionQuery = applicationRuntime.atom(
  publicApiClient.pipe(
    Effect.flatMap((client) => client.authSession.currentSession({})),
    Effect.catchTag("Unauthorized", () => Effect.succeed(null)),
  ),
).pipe(
  Atom.keepAlive,
  Atom.withReactivity(["auth"]),
)
