import {
  DocumentNavigation,
  DocumentNavigationError,
} from "@proxus/frontend-core/routing"
import { Effect, Layer } from "effect"

export interface BrowserDocumentLocation {
  readonly assign: (url: string) => void
}

export const browserDocumentNavigationLayer = (
  location: BrowserDocumentLocation = window.location,
) => Layer.succeed(DocumentNavigation, DocumentNavigation.of({
  assign: (url) => Effect.try({
    try: () => location.assign(url),
    catch: (cause) => new DocumentNavigationError({
      message: cause instanceof globalThis.Error
        ? cause.message
        : "Document navigation failed",
    }),
  }),
}))
