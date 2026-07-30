import { Context, type Effect, Schema } from "effect"

export class DocumentNavigationError extends Schema.TaggedErrorClass<DocumentNavigationError>()(
  "DocumentNavigationError",
  { message: Schema.String },
) {}

export class DocumentNavigation extends Context.Service<DocumentNavigation, {
  readonly assign: (url: string) => Effect.Effect<void, DocumentNavigationError>
}>()("@proxus/frontend-core/navigation/document-navigation/DocumentNavigation") {}
