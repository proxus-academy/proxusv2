// @effect-diagnostics nodeBuiltinImport:off
import { createHash } from "node:crypto"

/** GCP label values allow at most 63 lowercase letters, digits, underscores and
 * hyphens. Resource FQNs are not label-safe, so persist a stable fingerprint. */
export const ownerLabelValue = (fqn: string): string =>
  createHash("sha256").update(fqn).digest("hex").slice(0, 63)

export const ownerLabel = (fqn: string): Readonly<Record<"proxus_alchemy_fqn", string>> => ({
  proxus_alchemy_fqn: ownerLabelValue(fqn),
})
