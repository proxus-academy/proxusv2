import { makeRealtimeModule, realtimeRuntime } from "@proxus/frontend-core/realtime"

export const { lifecycleAtom: realtimeLifecycleAtom } = makeRealtimeModule(realtimeRuntime)
