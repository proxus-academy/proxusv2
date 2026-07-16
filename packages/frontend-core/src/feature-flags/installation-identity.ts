import type { FeatureFlagSubjectId } from "@proxus/shared/feature-flags"
import { Context, Effect } from "effect"

/** Platform seam for the non-authoritative installation identity used only for frontend allocation. */
export class FeatureFlagInstallationIdentity extends Context.Service<FeatureFlagInstallationIdentity, {
  readonly getOrCreate: () => Effect.Effect<FeatureFlagSubjectId>
}>()("@proxus/frontend-core/feature-flags/installation-identity/FeatureFlagInstallationIdentity") {}
