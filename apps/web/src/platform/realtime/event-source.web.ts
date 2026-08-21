import { RealtimeClient } from "@proxus/frontend-core/realtime"
import {
  RealtimeHeartbeat,
  type RealtimeEventName,
  SessionRefreshRequired,
} from "@proxus/shared/realtime"
import { Effect, Exit, Layer, Queue, Schema, Stream } from "effect"

export interface BrowserEventSource {
  addEventListener(type: RealtimeEventName, listener: (event: MessageEvent<string>) => void): void
  removeEventListener(type: RealtimeEventName, listener: (event: MessageEvent<string>) => void): void
  close(): void
}

export type BrowserEventSourceFactory = (url: string) => BrowserEventSource

const decodeHeartbeat = Schema.decodeUnknownExit(Schema.fromJsonString(RealtimeHeartbeat))
const decodeSessionRefreshRequired = Schema.decodeUnknownExit(Schema.fromJsonString(SessionRefreshRequired))

export const makeRealtimeClientWeb = (
  makeEventSource: BrowserEventSourceFactory = (url) => new EventSource(url),
) => Layer.succeed(RealtimeClient, RealtimeClient.of({
  events: Stream.callback((queue) => Effect.acquireRelease(
    Effect.sync(() => {
      const source = makeEventSource("/api/events")
      const onHeartbeat = (message: MessageEvent<string>) => {
        const decoded = decodeHeartbeat(message.data)
        if (Exit.isSuccess(decoded)) Queue.offerUnsafe(queue, decoded.value)
      }
      const onSessionRefreshRequired = (message: MessageEvent<string>) => {
        const decoded = decodeSessionRefreshRequired(message.data)
        if (Exit.isSuccess(decoded)) Queue.offerUnsafe(queue, decoded.value)
      }
      source.addEventListener("realtime.heartbeat", onHeartbeat)
      source.addEventListener("session.refresh-required", onSessionRefreshRequired)
      return { source, onHeartbeat, onSessionRefreshRequired }
    }),
    ({ source, onHeartbeat, onSessionRefreshRequired }) => Effect.sync(() => {
      source.removeEventListener("realtime.heartbeat", onHeartbeat)
      source.removeEventListener("session.refresh-required", onSessionRefreshRequired)
      source.close()
    }),
  ), { bufferSize: 128, strategy: "sliding" }),
}))

export const RealtimeClientWeb = makeRealtimeClientWeb()
