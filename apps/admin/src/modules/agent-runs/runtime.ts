import * as Atom from "effect/unstable/reactivity/Atom"
import { AdminAgentRunsClientLive } from "./api.js"
export const agentRunsRuntime = Atom.runtime(AdminAgentRunsClientLive)
