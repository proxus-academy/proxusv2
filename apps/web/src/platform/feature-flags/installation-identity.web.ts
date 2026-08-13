import { FeatureFlagInstallationIdentity } from "@proxus/frontend-core/feature-flags"
import {
  makeFeatureFlagSubjectId,
  parseFeatureFlagSubjectId,
  type FeatureFlagSubjectId,
} from "@proxus/shared/feature-flags"
import { Effect, Layer, Option, Schema } from "effect"
import { browserLocalStorage } from "./local-storage.web.js"

export const featureFlagInstallationStorageKey = "proxus.feature-flags.installation-id.v1"

const StoredFeatureFlagSubjectId = Schema.declare<FeatureFlagSubjectId>(
  (input): input is FeatureFlagSubjectId =>
    // SAFETY: Runtime representation is checked at this boundary before use.
    typeof input === "string" && parseFeatureFlagSubjectId(input) === input,
  { identifier: "StoredFeatureFlagSubjectId" },
)
const decodeStoredFeatureFlagSubjectId = Schema.decodeUnknownOption(StoredFeatureFlagSubjectId)
const encodeStoredFeatureFlagSubjectId = Schema.encodeOption(StoredFeatureFlagSubjectId)

export const makeFeatureFlagInstallationIdentityWeb = (
  storage: Pick<Storage, "getItem" | "setItem">,
  randomUUID: () => string,
) => {
  let memoryIdentity: FeatureFlagSubjectId | undefined

  return FeatureFlagInstallationIdentity.of({
    getOrCreate: () => Effect.gen(function*() {
      if (memoryIdentity !== undefined) return memoryIdentity

      const stored = yield* Effect.option(Effect.try({
        try: () => storage.getItem(featureFlagInstallationStorageKey),
        catch: () => undefined,
      }))
      if (Option.isSome(stored)) {
        const decoded = decodeStoredFeatureFlagSubjectId(stored.value)
        if (Option.isSome(decoded)) {
          memoryIdentity = decoded.value
          return decoded.value
        }
      }

      const created = makeFeatureFlagSubjectId(randomUUID())
      memoryIdentity = created
      const encoded = encodeStoredFeatureFlagSubjectId(created)
      if (Option.isSome(encoded)) {
        yield* Effect.ignore(Effect.try({
          try: () => storage.setItem(featureFlagInstallationStorageKey, encoded.value),
          catch: () => undefined,
        }))
      }
      return created
    }),
  })
}

export const FeatureFlagInstallationIdentityWebLive = Layer.sync(
  FeatureFlagInstallationIdentity,
  // Browser platform adapter; Web Crypto is intentionally localized at this seam.
  // @effect-diagnostics-next-line cryptoRandomUUID:off
  () => makeFeatureFlagInstallationIdentityWeb(browserLocalStorage, () => crypto.randomUUID()),
)
