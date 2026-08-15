// @effect-diagnostics preferSchemaOverJson:off effectSucceedWithVoid:off
import { Data, Effect } from "effect"
import {
  readDocument,
  StateBackendError,
  type GcsClient,
  isEmptyStageDocument,
  type KmsClient,
  type StageDocument,
  type StateConflictError,
  stateObjectName,
  writeDocument,
  withDocumentMutex,
} from "./gcs-state.ts"
import { processMutationRateLimiter, type MutationRateLimiter } from "./mutation-rate-limiter.ts"

export interface Clock { readonly now: Effect.Effect<number> }
export class LockHeldError extends Data.TaggedError("LockHeldError")<{ readonly owner: string; readonly expiresAt: number }> {}
export class LockOwnerError extends Data.TaggedError("LockOwnerError")<{ readonly expectedOwner: string }> {}
export class LockExpiredError extends Data.TaggedError("LockExpiredError")<{ readonly expiredAt: number }> {}
export class InvalidLeaseTtlError extends Data.TaggedError("InvalidLeaseTtlError")<{ readonly ttlMs: number }> {}
type LockError = LockHeldError | LockOwnerError | LockExpiredError | InvalidLeaseTtlError | StateConflictError | StateBackendError

export interface Lease {
  readonly stack: string
  readonly stage: string
  readonly owner: string
  readonly leaseId: string
  readonly expiresAt: number
  /** Current generation of the one stage document; successful state operations advance it. */
  readonly generation: string
}
export interface LeaseLockOptions { readonly rootPrefix?: string; readonly gcs: GcsClient; readonly kms: KmsClient; readonly clock: Clock; readonly mutationRateLimiter?: MutationRateLimiter }
interface AcquireLeaseRequest { readonly stack: string; readonly stage: string; readonly owner: string; readonly leaseId: string; readonly ttlMs: number }
interface RenewLeaseRequest { readonly stack: string; readonly stage: string; readonly lease: Lease; readonly ttlMs: number }
interface ReleaseLeaseRequest { readonly stack: string; readonly stage: string; readonly lease: Lease }
export interface LeaseLockCoordinator {
  readonly acquire: (request: AcquireLeaseRequest) => Effect.Effect<Lease, LockError>
  readonly renew: (request: RenewLeaseRequest) => Effect.Effect<Lease, LockError>
  readonly release: (request: ReleaseLeaseRequest) => Effect.Effect<void, LockError>
}
const validateTtl = (ttlMs: number): Effect.Effect<void, InvalidLeaseTtlError> => Number.isFinite(ttlMs) && ttlMs > 0
  ? Effect.void
  : Effect.fail(new InvalidLeaseTtlError({ ttlMs }))
const emptyDocument: StageDocument = { version: 1, resources: {} }

export const makeLeaseLock = ({ rootPrefix = "alchemy-state/v2", gcs, kms, clock, mutationRateLimiter = processMutationRateLimiter }: LeaseLockOptions): LeaseLockCoordinator => {
  const objectFor = (stack: string, stage: string) => stateObjectName(rootPrefix, stack, stage)
  const assertCoordinates = (stack: string, stage: string, lease: Lease) =>
    stack === lease.stack && stage === lease.stage ? Effect.void : Effect.fail(new LockOwnerError({ expectedOwner: "different stack/stage" }))
  const assertOwned = (document: StageDocument, lease: Lease, now: number) => {
    const current = document.lease
    if (current === undefined || current.owner !== lease.owner || current.leaseId !== lease.leaseId) {
      return Effect.fail(new LockOwnerError({ expectedOwner: current?.owner ?? "none" }))
    }
    if (current.expiresAt <= now) return Effect.fail(new LockExpiredError({ expiredAt: current.expiresAt }))
    return Effect.void
  }
  const retryCas = <A>(object: string, makeAttempt: () => Effect.Effect<A, LockError>, retries = 64): Effect.Effect<A, LockError> =>
    mutationRateLimiter.run(object, withDocumentMutex(gcs, object, makeAttempt())).pipe(
      Effect.catchIf((error) => error._tag === "StateConflictError" && retries > 0, () => retryCas(object, makeAttempt, retries - 1)),
    )
  return {
    acquire: (request) => {
      const object = objectFor(request.stack, request.stage)
      return retryCas(object, () => Effect.gen(function* () {
        yield* validateTtl(request.ttlMs)
        if (request.owner.length === 0 || request.leaseId.length === 0) return yield* new StateBackendError({ operation: "validate-lock-identity" })
        const now = yield* clock.now
        const stored = yield* readDocument(gcs, kms, object)
        const document = stored?.document ?? emptyDocument
        if (document.lease !== undefined && document.lease.expiresAt > now) return yield* new LockHeldError(document.lease)
        const expiresAt = now + request.ttlMs
        const generation = yield* writeDocument(gcs, kms, object, {
          ...document,
          lease: { owner: request.owner, leaseId: request.leaseId, expiresAt },
        }, stored?.generation ?? "0")
        return { stack: request.stack, stage: request.stage, owner: request.owner, leaseId: request.leaseId, expiresAt, generation }
      }))
    },
    renew: (request) => Effect.gen(function* () {
      yield* validateTtl(request.ttlMs)
      yield* assertCoordinates(request.stack, request.stage, request.lease)
      const object = objectFor(request.stack, request.stage)
      return yield* retryCas(object, () => Effect.gen(function* () {
        const now = yield* clock.now
        const stored = yield* readDocument(gcs, kms, object)
        if (stored === undefined) return yield* new LockOwnerError({ expectedOwner: "none" })
        yield* assertOwned(stored.document, request.lease, now)
        const expiresAt = now + request.ttlMs
        const generation = yield* writeDocument(gcs, kms, object, {
          ...stored.document,
          lease: { owner: request.lease.owner, leaseId: request.lease.leaseId, expiresAt },
        }, stored.generation)
        ;(request.lease as { generation: string }).generation = generation
        ;(request.lease as { expiresAt: number }).expiresAt = expiresAt
        return request.lease
      }))
    }),
    release: (request) => Effect.gen(function* () {
      yield* assertCoordinates(request.stack, request.stage, request.lease)
      const object = objectFor(request.stack, request.stage)
      yield* retryCas(object, () => Effect.gen(function* () {
        const now = yield* clock.now
        const stored = yield* readDocument(gcs, kms, object)
        if (stored === undefined) return yield* new LockOwnerError({ expectedOwner: "none" })
        yield* assertOwned(stored.document, request.lease, now)
        const { lease: _lease, ...unlocked } = stored.document
        // Destroy leaves an empty logical document. Remove only the generation
        // just decrypted; a takeover or stale writer makes the CAS fail and the
        // retry re-validates ownership instead of deleting their document.
        if (isEmptyStageDocument(unlocked)) yield* gcs.delete(object, stored.generation)
        else yield* writeDocument(gcs, kms, object, unlocked, stored.generation)
      }))
    }),
  }
}
