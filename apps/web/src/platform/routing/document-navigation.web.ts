import {
  DocumentNavigation,
  DocumentNavigationError,
} from "@proxus/frontend-core/navigation"
import { Effect, Layer } from "effect"

export interface BrowserDocumentLocation {
  readonly assign: (url: string) => void
}

export const browserDocumentNavigationLayer = (
  location?: BrowserDocumentLocation,
) => Layer.succeed(DocumentNavigation, DocumentNavigation.of({
  assign: (url) => Effect.try({
    try: () => (location ?? window.location).assign(url),
    catch: (cause) => new DocumentNavigationError({
      message: cause instanceof globalThis.Error
        ? cause.message
        : "Document navigation failed",
    }),
  }),
}))
