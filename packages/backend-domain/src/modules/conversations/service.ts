import type { AccountId } from "@proxus/shared/auth"
import type {
  AgentRun,
  AgentRunId,
  AgentRunNotFound,
  AgentRunInProgress,
  ConversationMessage,
  ConversationThread,
  ThreadId,
  ThreadNotFound,
} from "@proxus/shared/conversations"
import { Context, Effect } from "effect"
import type { ConversationsRepositoryError } from "./repository.js"

export type ConversationsError = ThreadNotFound | AgentRunInProgress | ConversationsRepositoryError

export class Conversations extends Context.Service<Conversations, {
  readonly createThread: (ownerId: AccountId, title: string) => Effect.Effect<ConversationThread, ConversationsRepositoryError>
  readonly listThreads: (ownerId: AccountId) => Effect.Effect<ReadonlyArray<ConversationThread>, ConversationsRepositoryError>
  readonly getThread: (ownerId: AccountId, threadId: ThreadId) => Effect.Effect<ConversationThread, ThreadNotFound | ConversationsRepositoryError>
  readonly renameThread: (ownerId: AccountId, threadId: ThreadId, title: string) => Effect.Effect<ConversationThread, ThreadNotFound | ConversationsRepositoryError>
  readonly deleteThread: (ownerId: AccountId, threadId: ThreadId) => Effect.Effect<void, ThreadNotFound | ConversationsRepositoryError>
  readonly listMessages: (ownerId: AccountId, threadId: ThreadId) => Effect.Effect<ReadonlyArray<ConversationMessage>, ThreadNotFound | ConversationsRepositoryError>
  readonly startRun: (ownerId: AccountId, threadId: ThreadId, message: string) => Effect.Effect<AgentRun, ConversationsError>
  readonly getRun: (ownerId: AccountId, runId: AgentRunId) => Effect.Effect<AgentRun, AgentRunNotFound | ConversationsRepositoryError>
  readonly interruptRun: (ownerId: AccountId, runId: AgentRunId) => Effect.Effect<AgentRun, AgentRunNotFound | ConversationsRepositoryError>
}>()("@proxus/backend-domain/modules/conversations/service/Conversations") {}
