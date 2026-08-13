import { Cause, Context, Effect, FileSystem, Result } from "effect"
import {
  HttpMiddleware,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http"

export const MaximumRequestBodySizeBytes = 256 * 1024
const MaximumRequestBodySize = FileSystem.Size(MaximumRequestBodySizeBytes)

const contentLengthExceedsLimit = (request: HttpServerRequest.HttpServerRequest) => {
  const header = request.headers["content-length"]
  if (header === undefined) return false
  const contentLength = Number(header)
  return Number.isFinite(contentLength) && contentLength > MaximumRequestBodySizeBytes
}

const isBodyLimitDefect = (cause: unknown) =>
  cause instanceof HttpServerError.HttpServerError &&
  cause.reason instanceof HttpServerError.RequestParseError &&
  cause.reason.cause instanceof Error &&
  cause.reason.cause.message === "maxBytes exceeded"

const causeIsBodyLimit = (cause: Cause.Cause<unknown>) => {
  const defect = Cause.findDefect(cause)
  return Result.isSuccess(defect) && isBodyLimitDefect(defect.success)
}

/** Applies the raw byte limit before HttpApi reads and decodes the request body. */
export const withRequestBodyLimit = HttpMiddleware.make(<E, R>(
  effect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    E,
    R | HttpServerRequest.HttpServerRequest
  >,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E, R> =>
  Effect.withFiber((fiber) => {
    const request = Context.getUnsafe(
      fiber.context,
      HttpServerRequest.HttpServerRequest,
    )
    if (contentLengthExceedsLimit(request)) {
      return Effect.succeed(HttpServerResponse.empty({ status: 413 }))
    }
    return effect.pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(HttpServerRequest.MaxBodySize, MaximumRequestBodySize),
      Effect.catchCause((cause) =>
        causeIsBodyLimit(cause)
          ? Effect.succeed(HttpServerResponse.empty({ status: 413 }))
          : Effect.failCause(cause),
      ),
    )
  }))
