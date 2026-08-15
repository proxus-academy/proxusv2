// This is the live application boundary: ADC and HTTP layers are intentionally
// provided here, and fetch/Date bridge platform APIs into injectable state ports.
// @effect-diagnostics strictEffectProvide:off multipleEffectProvide:off globalFetchInEffect:off globalDateInEffect:off asyncFunction:off
import { Credentials } from "@distilled.cloud/gcp"
import * as GCP from "@microagi/alchemy-gcp"
import { State } from "alchemy/State"
import { Effect, Layer, Redacted } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { makeLiveGcsClient, type GoogleHttpClient } from "./gcs-live.ts"
import { gcsStateLayer, StateBackendError } from "./gcs-state.ts"
import { distilledKmsOperations, makeLiveKmsClient } from "./kms-live.ts"
import type { Clock, Lease } from "./lease-lock.ts"

export interface PreviewPlatformStateOptions {
  readonly project: string
  readonly bucket: string
  readonly keyName: string
  /** A lease acquired by the external lock coordinator before Alchemy starts. */
  readonly lease: Lease
  readonly rootPrefix?: string
}

const clock: Clock = { now: Effect.sync(() => Date.now()) }
const http: GoogleHttpClient = {
  request: (request) => Effect.tryPromise({
    try: async () => {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: Buffer.from(request.body) }),
      })
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => { headers[key] = value })
      return { status: response.status, headers, body: new Uint8Array(await response.arrayBuffer()) }
    },
    catch: (cause) => new StateBackendError({ operation: "gcs-http", cause }),
  }),
}

/** Live GCS/KMS State layer. Lock acquisition/renewal/release stays external:
 * Stack beta.65 exposes only a State layer and has no lock lifecycle hooks. */
export const makePreviewPlatformStateBackend = (options: Omit<PreviewPlatformStateOptions, "lease">) => {
  const adc = GCP.fromADC(options.project)
  const token = {
    get: Credentials.pipe(
      Effect.flatMap((credentials) => credentials),
      Effect.map((credentials) => Redacted.value(credentials.accessToken)),
      Effect.mapError((cause) => new StateBackendError({ operation: "gcs-auth", cause })),
      Effect.provide(adc),
    ),
  }
  const kmsOperations = {
    encrypt: (request: Parameters<typeof distilledKmsOperations.encrypt>[0]) => distilledKmsOperations.encrypt(request).pipe(
      Effect.provide(adc), Effect.provide(FetchHttpClient.layer), Effect.mapError((cause) => new StateBackendError({ operation: "kms-encrypt", cause })),
    ),
    decrypt: (request: Parameters<typeof distilledKmsOperations.decrypt>[0]) => distilledKmsOperations.decrypt(request).pipe(
      Effect.provide(adc), Effect.provide(FetchHttpClient.layer), Effect.mapError((cause) => new StateBackendError({ operation: "kms-decrypt", cause })),
    ),
  }
  return {
    gcs: makeLiveGcsClient({ bucket: options.bucket, token, http }),
    kms: makeLiveKmsClient({ keyName: options.keyName, operations: kmsOperations }),
    clock,
    ...(options.rootPrefix === undefined ? {} : { rootPrefix: options.rootPrefix }),
  }
}

export const previewPlatformStateLive = (options: PreviewPlatformStateOptions): Layer.Layer<State> =>
  gcsStateLayer({ ...makePreviewPlatformStateBackend(options), lease: options.lease })
