import { Effect } from "effect"
import { applicationRuntime } from "../runtime.js"
import { publicApiClient } from "../public-api/client.js"

export const logoutAction = applicationRuntime.fn(
  () => publicApiClient.pipe(
    Effect.flatMap((client) => client.authSession.logout({})),
  ),
  { reactivityKeys: ["auth"] },
)
