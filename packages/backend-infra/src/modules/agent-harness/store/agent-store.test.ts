import { memoryAgentStoreLayer } from "./memory/layer.js"
import { pgliteAgentStoreLayer } from "./pglite/layer.js"
import { agentStoreContract } from "./test/agent-store-contract.js"

agentStoreContract("memory", () => memoryAgentStoreLayer)
agentStoreContract("PGlite", () => pgliteAgentStoreLayer())
