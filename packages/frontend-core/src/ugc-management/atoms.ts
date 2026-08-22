import type { UgcCommand } from "@proxus/shared/ugc-management"
import { Effect } from "effect"
import { PublicApiClient } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"

export const ugcWorkspaceQuery = applicationRuntime.atom(
  PublicApiClient.pipe(Effect.flatMap((client) => client.publicUgc.workspace())),
)

export const ugcCommandAction = applicationRuntime.fn((command: UgcCommand, get) =>
  PublicApiClient.pipe(
    Effect.flatMap((client) => client.publicUgc.command({ payload: { command } })),
    Effect.tap(() => Effect.sync(() => get.refresh(ugcWorkspaceQuery))),
  ),
)
