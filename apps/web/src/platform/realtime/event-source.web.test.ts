import { RealtimeClient } from "@proxus/frontend-core/realtime"
import { RealtimeEventFromJsonString, SessionRefreshRequired } from "@proxus/shared/realtime"
import { Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { makeRealtimeClientWeb, type BrowserEventSource } from "./event-source.web.js"

class FakeEventSource implements BrowserEventSource {
  constructor(private readonly onSubscribed: () => void) {}
  closed = false
  private listener: ((event: MessageEvent<string>) => void) | undefined
  addEventListener(_type: "realtime", listener: (event: MessageEvent<string>) => void): void {
    this.listener = listener
    this.onSubscribed()
  }
  removeEventListener(_type: "realtime", listener: (event: MessageEvent<string>) => void): void {
    if (this.listener === listener) this.listener = undefined
  }
  close() { this.closed = true }
  emit(data: string) { this.listener?.(new MessageEvent("realtime", { data })) }
}

describe("web realtime client", () => {
  it("decodes named SSE events and closes EventSource with the stream scope", () => Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const subscribed = yield* Deferred.make<void>()
      const source = new FakeEventSource(() => { Deferred.doneUnsafe(subscribed, Effect.void) })
      const urls: Array<string> = []
      const context = yield* Layer.build(makeRealtimeClientWeb((url) => {
        urls.push(url)
        return source
      }))
      const fiber = yield* RealtimeClient.use((client) => client.events.pipe(Stream.runHead)).pipe(
        Effect.provide(context),
        Effect.forkChild,
      )
      yield* Deferred.await(subscribed)
      source.emit(Schema.encodeSync(RealtimeEventFromJsonString)(new SessionRefreshRequired({ version: 1 })))
      const event = yield* Fiber.join(fiber)
      expect(Option.getOrThrow(event)._tag).toBe("session.refresh-required")
      expect(urls).toEqual(["/api/events"])
      expect(source.closed).toBe(true)
    })),
  ))
})
