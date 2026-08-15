// Alchemy state is an intentionally schemaless persistence boundary.
// @effect-diagnostics preferSchemaOverJson:off effectSucceedWithVoid:off newPromise:off
import {
  encodeState,
  reviveStateRecursive,
  STATE_STORE_VERSION,
  State,
  StateStoreError,
  type PersistedState,
  type ReplacedResourceState,
  type StateService,
} from "alchemy/State"
import { Data, Effect, Layer } from "effect"
import type { Clock, Lease } from "./lease-lock.ts"
import { processMutationRateLimiter, type MutationRateLimiter } from "./mutation-rate-limiter.ts"

export class StateConflictError extends Data.TaggedError("StateConflictError")<{ readonly object: string }> {}
export class StateBackendError extends Data.TaggedError("StateBackendError")<{
  readonly operation: string
  /** Sanitized HTTP metadata only; response bodies and credentials are never retained. */
  readonly status?: number
  readonly attempt?: number
  readonly cause?: unknown
}> {}
type StateAdapterError = StateConflictError | StateBackendError

interface GcsObject { readonly data: Uint8Array; readonly generation: string }
export interface GcsClient {
  readonly read: (object: string) => Effect.Effect<GcsObject | undefined, StateBackendError>
  readonly write: (object: string, data: Uint8Array, expectedGeneration: string) => Effect.Effect<string, StateConflictError | StateBackendError>
  /** Deletes exactly the generation that was inspected. */
  readonly delete: (object: string, expectedGeneration: string) => Effect.Effect<void, StateConflictError | StateBackendError>
  readonly list: (prefix: string) => Effect.Effect<ReadonlyArray<string>, StateBackendError>
}
export interface KmsClient {
  readonly encrypt: (plaintext: Uint8Array) => Effect.Effect<Uint8Array, StateBackendError>
  readonly decrypt: (ciphertext: Uint8Array) => Effect.Effect<Uint8Array, StateBackendError>
}
interface StoredLease { readonly owner: string; readonly leaseId: string; readonly expiresAt: number }
export interface StageDocument {
  readonly version: 1
  readonly lease?: StoredLease
  readonly resources: Readonly<Record<string, unknown>>
  readonly output?: unknown
}
export interface GcsStateOptions {
  readonly rootPrefix?: string
  readonly gcs: GcsClient
  readonly kms: KmsClient
  readonly clock: Clock
  /** The live lease handle. Successful state writes advance its generation. */
  readonly lease: Lease
  /** Injectable for deterministic tests; live adapters share the process coordinator. */
  readonly mutationRateLimiter?: MutationRateLimiter
}

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })
const segment = encodeURIComponent
const unsegment = decodeURIComponent
export const stateObjectName = (rootPrefix: string, stack: string, stage: string) =>
  `${rootPrefix.replace(/^\/+|\/+$/g, "")}/${segment(stack)}/${segment(stage)}`

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const decodeDocument = (plaintext: Uint8Array): StageDocument => {
  const value = reviveStateRecursive(JSON.parse(decoder.decode(plaintext)) as unknown)
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.resources)) throw new TypeError("invalid state document")
  if (value.lease !== undefined && (!isRecord(value.lease) || typeof value.lease.owner !== "string" || typeof value.lease.leaseId !== "string" || typeof value.lease.expiresAt !== "number")) {
    throw new TypeError("invalid state lease")
  }
  return value as unknown as StageDocument
}
export const readDocument = (gcs: GcsClient, kms: KmsClient, object: string) =>
  gcs.read(object).pipe(Effect.flatMap((stored) => stored === undefined
    ? Effect.succeed(undefined)
    : kms.decrypt(stored.data).pipe(Effect.flatMap((plaintext) => Effect.try({
      try: () => ({ document: decodeDocument(plaintext), generation: stored.generation }),
      catch: (cause) => new StateBackendError({ operation: "decode-state", cause }),
    })))))
const isEmptyStageOutput = (output: unknown): boolean =>
  output === undefined || (isRecord(output) && Object.keys(output).length === 0)

/** Empty means no resource records, no lease, and no meaningful stack output. */
export const isEmptyStageDocument = (document: StageDocument): boolean =>
  Object.keys(document.resources).length === 0 && isEmptyStageOutput(document.output) && document.lease === undefined

export const writeDocument = (gcs: GcsClient, kms: KmsClient, object: string, document: StageDocument, generation: string) =>
  kms.encrypt(encoder.encode(JSON.stringify(encodeState(document)))).pipe(
    Effect.flatMap((ciphertext) => gcs.write(object, ciphertext, generation)),
  )

interface DocumentMutex { tail: Promise<void> }
const documentMutexes = new WeakMap<GcsClient, Map<string, DocumentMutex>>()
const mutexFor = (gcs: GcsClient, object: string): DocumentMutex => {
  let byObject = documentMutexes.get(gcs)
  if (byObject === undefined) {
    byObject = new Map()
    documentMutexes.set(gcs, byObject)
  }
  let mutex = byObject.get(object)
  if (mutex === undefined) {
    mutex = { tail: Promise.resolve() }
    byObject.set(object, mutex)
  }
  return mutex
}

/** Serializes read/merge/CAS transactions made by adapters in this process. */
export const withDocumentMutex = <A, E>(gcs: GcsClient, object: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(() => {
      const mutex = mutexFor(gcs, object)
      const previous = mutex.tail
      let release!: () => void
      mutex.tail = new Promise<void>((resolve) => { release = resolve })
      return previous.then(() => release)
    }),
    () => effect,
    (release) => Effect.sync(release),
  )

const sanitizedCause = (cause: unknown): string | undefined => {
  if (cause === undefined) return undefined
  if (isRecord(cause) && typeof cause._tag === "string") return cause._tag
  if (cause instanceof Error) return cause.name
  return typeof cause
}

/** Produces log-safe backend diagnostics without retaining response bodies, state or credentials. */
const stateErrorDiagnostic = (error: StateAdapterError | unknown): Readonly<{
  operation?: string
  status?: number
  attempt?: number
  cause?: string
}> => {
  if (error instanceof StateConflictError) return {}
  const cause = sanitizedCause(error instanceof StateBackendError ? error.cause : error)
  return error instanceof StateBackendError
    ? {
        operation: error.operation,
        ...(error.status === undefined ? {} : { status: error.status }),
        ...(error.attempt === undefined ? {} : { attempt: error.attempt }),
        ...(cause === undefined ? {} : { cause }),
      }
    : { ...(cause === undefined ? {} : { cause }) }
}

class SanitizedStateCause extends Data.TaggedError("SanitizedStateCause")<{
  readonly message: string
  readonly diagnostic: ReturnType<typeof stateErrorDiagnostic>
}> {}

const safeError = (error: StateAdapterError | unknown): StateStoreError => {
  const diagnostic = stateErrorDiagnostic(error)
  const details = Object.entries(diagnostic).map(([key, value]) => `${key}=${String(value)}`).join(" ")
  return new StateStoreError({
    message: `${error instanceof StateConflictError ? "remote state changed concurrently" : "remote state operation failed"}${details.length === 0 ? "" : ` (${details})`}`,
    // Retain only the sanitized diagnostic. Native/backend errors can contain HTTP bodies.
    ...(details.length === 0 ? {} : { cause: new SanitizedStateCause({ message: details, diagnostic }) }),
  })
}

export const makeGcsState = ({ rootPrefix = "alchemy-state/v2", gcs, kms, clock, lease, mutationRateLimiter = processMutationRateLimiter }: GcsStateOptions): StateService => {
  const root = rootPrefix.replace(/^\/+|\/+$/g, "")
  const object = stateObjectName(root, lease.stack, lease.stage)
  const assertRequest = (stack: string, stage: string): Effect.Effect<void, StateConflictError> =>
    stack === lease.stack && stage === lease.stage ? Effect.void : Effect.fail(new StateConflictError({ object }))
  const loadCurrent = Effect.gen(function* () {
    const stored = yield* readDocument(gcs, kms, object)
    if (stored === undefined) return yield* new StateConflictError({ object })
    const now = yield* clock.now
    const lock = stored.document.lease
    if (lock === undefined || lock.owner !== lease.owner || lock.leaseId !== lease.leaseId || lock.expiresAt <= now) {
      return yield* new StateConflictError({ object })
    }
    ;(lease as { generation: string }).generation = stored.generation
    ;(lease as { expiresAt: number }).expiresAt = lock.expiresAt
    return stored
  })
  const mutateAttempt = (change: (document: StageDocument) => StageDocument) => Effect.gen(function* () {
    const stored = yield* loadCurrent
    const generation = yield* writeDocument(gcs, kms, object, change(stored.document), stored.generation)
    ;(lease as { generation: string }).generation = generation
  })
  const mutate = (change: (document: StageDocument) => StageDocument): Effect.Effect<void, StateAdapterError> => {
    const attempt = (remaining: number): Effect.Effect<void, StateAdapterError> => mutationRateLimiter.run(
      object,
      withDocumentMutex(gcs, object, mutateAttempt(change)),
    ).pipe(Effect.catchIf((error) => error._tag === "StateConflictError" && remaining > 0, () => attempt(remaining - 1)))
    return attempt(64)
  }
  const read = (stack: string, stage: string) => Effect.gen(function* () {
    yield* assertRequest(stack, stage)
    return (yield* loadCurrent).document
  })
  const translated = <A>(effect: Effect.Effect<A, StateAdapterError>): Effect.Effect<A, StateStoreError> => effect.pipe(Effect.mapError(safeError))
  const stagePrefix = (stack: string) => `${root}/${segment(stack)}/`

  return {
    id: "gcs-kms-atomic",
    getVersion: () => Effect.succeed(STATE_STORE_VERSION),
    listStacks: () => translated(gcs.list(`${root}/`).pipe(Effect.map((names) => [...new Set(names.map((name) => unsegment(name.slice(root.length + 1).split("/")[0]!)))].sort()))),
    listStages: (stack) => translated(gcs.list(stagePrefix(stack)).pipe(Effect.map((names) => names.map((name) => unsegment(name.slice(stagePrefix(stack).length))).sort()))),
    // Alchemy beta.65's read-only CLI exposes stack outputs only through the
    // reserved local-state FQN. Mirror that lookup for this remote backend.
    get: ({ stack, stage, fqn }) => translated(read(stack, stage).pipe(Effect.map((document) => (fqn === "__stack_output__" ? document.output : document.resources[fqn]) as PersistedState | undefined))),
    getReplacedResources: ({ stack, stage }) => translated(read(stack, stage).pipe(Effect.map((document) => Object.values(document.resources).filter((value): value is ReplacedResourceState => isRecord(value) && value.status === "replaced")))),
    set: ({ stack, stage, fqn, value }) => translated(assertRequest(stack, stage).pipe(Effect.andThen(mutate((document) => ({ ...document, resources: { ...document.resources, [fqn]: value } }))), Effect.as(value))),
    delete: ({ stack, stage, fqn }) => translated(assertRequest(stack, stage).pipe(Effect.andThen(mutate((document) => { const resources = { ...document.resources }; delete resources[fqn]; return { ...document, resources } })))),
    deleteStack: ({ stack, stage }) => translated(stage === undefined
      ? Effect.fail(new StateBackendError({ operation: "delete-stack-requires-stage-lease" }))
      : assertRequest(stack, stage).pipe(Effect.andThen(mutate((document) => { const { resources: _resources, output: _output, ...metadata } = document; return { ...metadata, resources: {} } })))),
    list: ({ stack, stage }) => translated(read(stack, stage).pipe(Effect.map((document) => Object.keys(document.resources).sort()))),
    getOutput: ({ stack, stage }) => translated(read(stack, stage).pipe(Effect.map((document) => document.output))),
    setOutput: ({ stack, stage, value }) => translated(assertRequest(stack, stage).pipe(Effect.andThen(mutate((document) => ({ ...document, output: value }))), Effect.as(value))),
  }
}

export const gcsStateLayer = (options: GcsStateOptions): Layer.Layer<State> => Layer.succeed(State, Effect.succeed(makeGcsState(options)))
