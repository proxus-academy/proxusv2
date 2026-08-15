import {
  decryptProjectsLocationsKeyRingsCryptoKeys,
  encryptProjectsLocationsKeyRingsCryptoKeys,
  type DecryptProjectsLocationsKeyRingsCryptoKeysResponse,
  type EncryptProjectsLocationsKeyRingsCryptoKeysResponse,
} from "@distilled.cloud/gcp/cloudkms-v1"
import { Context, Effect, Layer } from "effect"
import { StateBackendError, type KmsClient } from "./gcs-state.ts"

export interface DistilledKmsOperations {
  readonly encrypt: (request: { readonly name: string; readonly body: { readonly plaintext: string } }) => Effect.Effect<EncryptProjectsLocationsKeyRingsCryptoKeysResponse, StateBackendError>
  readonly decrypt: (request: { readonly name: string; readonly body: { readonly ciphertext: string } }) => Effect.Effect<DecryptProjectsLocationsKeyRingsCryptoKeysResponse, StateBackendError>
}
export interface LiveKmsOptions { readonly keyName: string; readonly operations: DistilledKmsOperations }
class KmsLive extends Context.Service<KmsLive, KmsClient>()("@proxus/infra/alchemy/state/kms-live/KmsLive") {}

const backend = (operation: string, cause?: unknown) => new StateBackendError({ operation, cause })
const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")
const decode = (value: unknown, operation: string) => {
  if (typeof value !== "string" || value.length === 0) throw backend(operation)
  return Uint8Array.from(Buffer.from(value, "base64"))
}

/** Uses the generated distilled Cloud KMS Encrypt/Decrypt API. Operations are
 * injectable after providing distilled's Credentials/HttpClient environment. */
export const makeLiveKmsClient = ({ keyName, operations }: LiveKmsOptions): KmsClient => ({
  encrypt: (plaintext) => operations.encrypt({ name: keyName, body: { plaintext: encode(plaintext) } }).pipe(
    Effect.mapError((cause) => backend("kms-encrypt", cause)),
    Effect.flatMap((response) => Effect.try({ try: () => decode(response.ciphertext, "kms-encrypt-response"), catch: (cause) => cause instanceof StateBackendError ? cause : backend("kms-encrypt-response", cause) })),
  ),
  decrypt: (ciphertext) => operations.decrypt({ name: keyName, body: { ciphertext: encode(ciphertext) } }).pipe(
    Effect.mapError((cause) => backend("kms-decrypt", cause)),
    Effect.flatMap((response) => Effect.try({ try: () => decode(response.plaintext, "kms-decrypt-response"), catch: (cause) => cause instanceof StateBackendError ? cause : backend("kms-decrypt-response", cause) })),
  ),
})

export const distilledKmsOperations = {
  encrypt: encryptProjectsLocationsKeyRingsCryptoKeys,
  decrypt: decryptProjectsLocationsKeyRingsCryptoKeys,
}
const kmsLiveLayer = (options: LiveKmsOptions) => Layer.succeed(KmsLive, makeLiveKmsClient(options))
