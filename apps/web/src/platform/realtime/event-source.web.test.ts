import { RealtimeClient } from "@proxus/frontend-core/realtime"
import { RealtimeHeartbeat, SessionRefreshRequired } from "@proxus/shared/realtime"
import { Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { makeRealtimeClientWeb, type BrowserEventSource } from "./event-source.web.js"

class FakeEventSource implements BrowserEventSource {
  constructor(private readonly onSubscribed: () => void) {}
  closed = false
  private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>()
  get listenerCount() { return this.listeners.size }
  addEventListener(type: "realtime.heartbeat" | "session.refresh-required", listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener)
    if (this.listeners.size === 2) this.onSubscribed()
  }
  removeEventListener(type: "realtime.heartbeat" | "session.refresh-required", listener: (event: MessageEvent<string>) => void): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type)
  }
  close() { this.closed = true }
  emit(type: "realtime.heartbeat" | "session.refresh-required", data: string) {
    this.listeners.get(type)?.(new MessageEvent(type, { data }))
  }
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
      source.emit(
        "session.refresh-required",
        Schema.encodeSync(Schema.fromJsonString(RealtimeHeartbeat))(
          new RealtimeHeartbeat({ version: 1 }),
        ),
      )
      source.emit(
        "session.refresh-required",
        Schema.encodeSync(Schema.fromJsonString(SessionRefreshRequired))(
          new SessionRefreshRequired({ version: 1 }),
        ),
      )
      const event = yield* Fiber.join(fiber)
      expect(Option.getOrThrow(event)._tag).toBe("session.refresh-required")
      expect(urls).toEqual(["/api/events"])
      expect(source.closed).toBe(true)
      expect(source.listenerCount).toBe(0)
    })),
  ))
})
