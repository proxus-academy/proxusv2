import * as Data from "effect/Data"

export interface BootstrapConfig {
  readonly project: string
  readonly location: string
  readonly bucket: string
  readonly keyRingId: string
  readonly cryptoKeyId: string
  readonly operator: string
}
class BootstrapConfigError extends Data.TaggedError("BootstrapConfigError")<{ readonly message: string }> {}
const required = (env: NodeJS.ProcessEnv, key: string) => {
  const value = env[key]?.trim()
  if (value === undefined || value.length === 0) throw new BootstrapConfigError({ message: `${key} is required` })
  return value
}
export const readBootstrapConfig = (env: NodeJS.ProcessEnv): BootstrapConfig => {
  const location = required(env, "GCP_REGION")
  if (location !== "europe-southwest1") throw new BootstrapConfigError({ message: "GCP_REGION must be europe-southwest1" })
  const bucket = required(env, "ALCHEMY_STATE_BUCKET")
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) throw new BootstrapConfigError({ message: "ALCHEMY_STATE_BUCKET is not a valid physical bucket ID" })
  const id = (key: string) => { const value = required(env, key); if (!/^[A-Za-z0-9_-]{1,63}$/.test(value)) throw new BootstrapConfigError({ message: `${key} is not a valid physical ID` }); return value }
  const operator = required(env, "GCP_OPERATOR_PRINCIPAL")
  if (!/^(user|serviceAccount|group):[^\s@]+@[^\s@]+$/.test(operator)) throw new BootstrapConfigError({ message: "GCP_OPERATOR_PRINCIPAL must be a user, group, or serviceAccount principal" })
  return { project: required(env, "GCP_PROJECT_ID"), location, bucket, keyRingId: id("ALCHEMY_STATE_KEY_RING_ID"), cryptoKeyId: id("ALCHEMY_STATE_CRYPTO_KEY_ID"), operator }
}
