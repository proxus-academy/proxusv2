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
  baseUrl?: string,
) => Layer.succeed(DocumentNavigation, DocumentNavigation.of({
  assign: (url) => Effect.try({
    try: () => {
      const target = location ?? window.location
      const resolved = url.startsWith("http://") || url.startsWith("https://")
        ? url
        : new URL(url, baseUrl ?? window.location.href).href
      target.assign(resolved)
    },
    catch: (cause) => new DocumentNavigationError({
      message: cause instanceof globalThis.Error
        ? cause.message
        : "Document navigation failed",
    }),
  }),
}))
