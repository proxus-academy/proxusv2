import { Cause, Context, Effect, FileSystem, Result } from "effect"
import { HttpMiddleware, HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

const maximumBytes = 256 * 1024
const maximumSize = FileSystem.Size(maximumBytes)
const isLimitFailure = (cause: Cause.Cause<unknown>) => {
  const defect = Cause.findDefect(cause)
  return Result.isSuccess(defect) && defect.success instanceof HttpServerError.HttpServerError &&
    defect.success.reason instanceof HttpServerError.RequestParseError &&
    defect.success.reason.cause instanceof Error && defect.success.reason.cause.message === "maxBytes exceeded"
}

export const withRequestBodyLimit = HttpMiddleware.make(<E, R>(effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R | HttpServerRequest.HttpServerRequest>) =>
  Effect.withFiber((fiber) => {
    const request = Context.getUnsafe(fiber.context, HttpServerRequest.HttpServerRequest)
    const length = Number(request.headers["content-length"])
    if (Number.isFinite(length) && length > maximumBytes) return Effect.succeed(HttpServerResponse.empty({ status: 413 }))
    return effect.pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(HttpServerRequest.MaxBodySize, maximumSize),
      Effect.catchCause((cause) => isLimitFailure(cause) ? Effect.succeed(HttpServerResponse.empty({ status: 413 })) : Effect.failCause(cause)),
    )
  }))
