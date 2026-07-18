import { FeatureFlagInstallationIdentity } from "@proxus/frontend-core/feature-flags"
import { makeFeatureFlagSubjectId, parseFeatureFlagSubjectId } from "@proxus/shared/feature-flags"
import { Effect, Layer } from "effect"

export const featureFlagInstallationStorageKey = "proxus.feature-flags.installation-id.v1"

export const makeFeatureFlagInstallationIdentityWeb = (storage: Pick<Storage, "getItem" | "setItem">, randomUUID: () => string) =>
  FeatureFlagInstallationIdentity.of({
    getOrCreate: () => Effect.sync(() => {
      const existing = parseFeatureFlagSubjectId(storage.getItem(featureFlagInstallationStorageKey))
      if (existing !== null) return existing
      const created = makeFeatureFlagSubjectId(randomUUID())
      storage.setItem(featureFlagInstallationStorageKey, created)
      return created
    }),
  })

export const FeatureFlagInstallationIdentityWebLive = Layer.sync(
  FeatureFlagInstallationIdentity,
  // Browser platform adapter; Web Crypto is intentionally localized at this seam.
  // @effect-diagnostics-next-line cryptoRandomUUID:off
  () => makeFeatureFlagInstallationIdentityWeb(window.localStorage, () => crypto.randomUUID()),
)
