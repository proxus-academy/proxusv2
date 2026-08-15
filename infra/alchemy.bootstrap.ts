import { StorageBucketIamMember, providers as gcpProviders } from "@microagi/alchemy-gcp"
import { Stack } from "alchemy"
import { retain } from "alchemy/RemovalPolicy"
import { localState } from "alchemy/State"
import { Effect, Layer } from "effect"
import { readBootstrapConfig } from "./src/alchemy/bootstrap-config.ts"
import { CryptoKey, CryptoKeyIamMember, KeyRing } from "./src/alchemy/providers/cloud-kms.ts"
import { cloudKmsProviderLayers } from "./src/alchemy/providers/cloud-kms-live.ts"
import { StateBucket } from "./src/alchemy/providers/state-bucket.ts"
import { stateBucketLiveLayer } from "./src/alchemy/providers/state-bucket-live.ts"

const config = readBootstrapConfig(process.env)
const providers = Layer.mergeAll(gcpProviders(), stateBucketLiveLayer(config.project), cloudKmsProviderLayers({ project: config.project }))

export default Stack("bootstrap", { providers, state: localState() }, Effect.gen(function* () {
  const bucket = yield* StateBucket("StateBucket", { project: config.project, name: config.bucket, location: config.location, deletionProtection: true }).pipe(retain())
  const ring = yield* KeyRing("StateKeyRing", { project: config.project, location: config.location, keyRingId: config.keyRingId }).pipe(retain())
  // Bootstrap state is intentionally ephemeral. Use the configured physical KeyRing name
  // rather than an unresolved output so a cold plan can read/adopt the existing CryptoKey.
  const keyRingName = `projects/${config.project}/locations/${config.location}/keyRings/${config.keyRingId}`
  const key = yield* CryptoKey("StateCryptoKey", { keyRing: keyRingName, cryptoKeyId: config.cryptoKeyId, purpose: "ENCRYPT_DECRYPT", rotationPeriod: "7776000s", deletionProtection: true }).pipe(retain())
  yield* StorageBucketIamMember("OperatorStateObjects", { bucket: bucket.name, role: "roles/storage.objectAdmin", member: config.operator })
  yield* StorageBucketIamMember("OperatorStateBucketReader", { bucket: bucket.name, role: "roles/storage.legacyBucketReader", member: config.operator })
  yield* CryptoKeyIamMember("OperatorStateEncryption", { cryptoKey: key.name, role: "roles/cloudkms.cryptoKeyEncrypterDecrypter", member: config.operator })
  return { bucket: bucket.name, key: key.name }
}))
