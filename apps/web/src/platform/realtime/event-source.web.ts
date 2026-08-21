import { RealtimeClient } from "@proxus/frontend-core/realtime"
import { RealtimeEventFromJsonString } from "@proxus/shared/realtime"
import { Effect, Exit, Layer, Queue, Schema, Stream } from "effect"

export interface BrowserEventSource {
  addEventListener(type: "realtime", listener: (event: MessageEvent<string>) => void): void
  removeEventListener(type: "realtime", listener: (event: MessageEvent<string>) => void): void
  close(): void
}

export type BrowserEventSourceFactory = (url: string) => BrowserEventSource

const decodeEvent = Schema.decodeUnknownExit(RealtimeEventFromJsonString)

export const makeRealtimeClientWeb = (
  makeEventSource: BrowserEventSourceFactory = (url) => new EventSource(url),
) => Layer.succeed(RealtimeClient, RealtimeClient.of({
  events: Stream.callback((queue) => Effect.acquireRelease(
    Effect.sync(() => {
      const source = makeEventSource("/api/events")
      const onRealtime = (message: MessageEvent<string>) => {
        const decoded = decodeEvent(message.data)
        if (Exit.isSuccess(decoded)) Queue.offerUnsafe(queue, decoded.value)
      }
      source.addEventListener("realtime", onRealtime)
      return { source, onRealtime }
    }),
    ({ source, onRealtime }) => Effect.sync(() => {
      source.removeEventListener("realtime", onRealtime)
      source.close()
    }),
  ), { bufferSize: 128, strategy: "sliding" }),
}))

export const RealtimeClientWeb = makeRealtimeClientWeb()
