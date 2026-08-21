import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { SessionAuthorization } from "../auth/middleware.js"
import { CreateThreadPayload, RenameThreadPayload, StartAgentRunPayload } from "./contract.js"
import { AgentRunInProgress, ThreadNotFound } from "./errors.js"
import { AgentRun, AgentRunId, ConversationMessage, ConversationThread, ThreadId } from "./schema.js"

const internal = HttpApiError.InternalServerErrorNoContent

export class PublicConversationsApi extends HttpApiGroup.make("conversations")
  .add(
    HttpApiEndpoint.get("listThreads", "/threads", { success: Schema.Array(ConversationThread), error: internal }),
    HttpApiEndpoint.post("createThread", "/threads", {
      payload: CreateThreadPayload,
      success: ConversationThread.pipe(HttpApiSchema.status("Created")),
      error: internal,
    }),
    HttpApiEndpoint.get("getThread", "/threads/:threadId", {
      params: { threadId: ThreadId },
      success: ConversationThread,
      error: [ThreadNotFound, internal],
    }),
    HttpApiEndpoint.patch("renameThread", "/threads/:threadId", {
      params: { threadId: ThreadId },
      payload: RenameThreadPayload,
      success: ConversationThread,
      error: [ThreadNotFound, internal],
    }),
    HttpApiEndpoint.delete("deleteThread", "/threads/:threadId", {
      params: { threadId: ThreadId },
      success: HttpApiSchema.NoContent,
      error: [ThreadNotFound, internal],
    }),
    HttpApiEndpoint.get("listMessages", "/threads/:threadId/messages", {
      params: { threadId: ThreadId },
      success: Schema.Array(ConversationMessage),
      error: [ThreadNotFound, internal],
    }),
    HttpApiEndpoint.post("startRun", "/threads/:threadId/runs", {
      params: { threadId: ThreadId },
      payload: StartAgentRunPayload,
      success: AgentRun.pipe(HttpApiSchema.status("Accepted")),
      error: [ThreadNotFound, AgentRunInProgress, internal],
    }),
    HttpApiEndpoint.get("getRun", "/runs/:runId", {
      params: { runId: AgentRunId },
      success: AgentRun,
      error: internal,
    }),
    HttpApiEndpoint.post("interruptRun", "/runs/:runId/interrupt", {
      params: { runId: AgentRunId },
      success: AgentRun,
      error: internal,
    }),
  )
  .prefix("/conversations")
  .middleware(SessionAuthorization) {}
