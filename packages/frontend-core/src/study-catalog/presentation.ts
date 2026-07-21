import { StudyNodeNotFound } from "@proxus/shared/study-catalog"
import { Cause, Data, Option, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { HttpClientError } from "effect/unstable/http"
import { HttpApiError } from "effect/unstable/httpapi"

export class StudyCatalogNotFound extends Data.TaggedClass("StudyCatalogNotFound")<{
  readonly error: StudyNodeNotFound
}> {}

export class StudyCatalogUnavailable extends Data.TaggedClass("StudyCatalogUnavailable")<{
  readonly error: HttpApiError.InternalServerError | HttpClientError.HttpClientError
}> {}

export class StudyCatalogUnexpected extends Data.TaggedClass("StudyCatalogUnexpected")<{
  readonly cause: Cause.Cause<unknown>
}> {}

export type StudyCatalogViewError =
  | StudyCatalogNotFound
  | StudyCatalogUnavailable
  | StudyCatalogUnexpected

export type StudyCatalogViewState<A> =
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "Failure"; readonly error: StudyCatalogViewError }
  | { readonly _tag: "Initial" }

export const classifyStudyCatalogCause = <E>(cause: Cause.Cause<E>): StudyCatalogViewError => {
  const error = Cause.findErrorOption(cause)
  if (Option.isSome(error)) {
    if (Schema.is(StudyNodeNotFound)(error.value)) {
      return new StudyCatalogNotFound({ error: error.value })
    }
    if (Schema.is(HttpApiError.InternalServerError)(error.value) || HttpClientError.isHttpClientError(error.value)) {
      return new StudyCatalogUnavailable({ error: error.value })
    }
  }
  return new StudyCatalogUnexpected({ cause })
}

export const toStudyCatalogViewState = <A, E>(
  result: AsyncResult.AsyncResult<A, E>,
): StudyCatalogViewState<A> => {
  if (AsyncResult.isSuccess(result)) return { _tag: "Success", value: result.value }
  if (AsyncResult.isFailure(result)) {
    return { _tag: "Failure", error: classifyStudyCatalogCause(result.cause) }
  }
  return { _tag: "Initial" }
}
