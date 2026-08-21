import type { AccountId } from "@proxus/shared/auth"
import type {
  AgentRun,
  AgentRunId,
  AgentRunInProgress,
  AgentRunNotFound,
  AgentTurnId,
  ConversationMessage,
  ConversationThread,
  MessageId,
  ModelGenerationId,
  ThreadId,
  ThreadNotFound,
} from "@proxus/shared/conversations"
import { Context, Effect, Option, Schema } from "effect"
import type { AiOperation } from "@proxus/shared/ai-operations"

export class ConversationsRepositoryError extends Schema.TaggedErrorClass<ConversationsRepositoryError>()(
  "ConversationsRepositoryError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

export class ConversationsRepository extends Context.Service<ConversationsRepository, {
  readonly createThread: (thread: ConversationThread) => Effect.Effect<ConversationThread, ConversationsRepositoryError>
  readonly listThreads: (ownerId: AccountId) => Effect.Effect<ReadonlyArray<ConversationThread>, ConversationsRepositoryError>
  readonly findThread: (ownerId: AccountId, threadId: ThreadId) => Effect.Effect<Option.Option<ConversationThread>, ConversationsRepositoryError>
  readonly renameThread: (ownerId: AccountId, threadId: ThreadId, title: string, updatedAt: ConversationThread["updatedAt"]) => Effect.Effect<ConversationThread, ThreadNotFound | ConversationsRepositoryError>
  readonly deleteThread: (ownerId: AccountId, threadId: ThreadId, deletedAt: ConversationThread["updatedAt"]) => Effect.Effect<void, ThreadNotFound | ConversationsRepositoryError>
  readonly listMessages: (ownerId: AccountId, threadId: ThreadId) => Effect.Effect<ReadonlyArray<ConversationMessage>, ThreadNotFound | ConversationsRepositoryError>
  readonly startRun: (input: {
    readonly ownerId: AccountId
    readonly threadId: ThreadId
    readonly runId: AgentRunId
    readonly userMessageId: MessageId
    readonly assistantMessageId: MessageId
    readonly message: string
    readonly now: AgentRun["createdAt"]
  }) => Effect.Effect<AgentRun, ThreadNotFound | AgentRunInProgress | ConversationsRepositoryError>
  readonly findRun: (ownerId: AccountId, runId: AgentRunId) => Effect.Effect<Option.Option<AgentRun>, ConversationsRepositoryError>
  readonly interruptRun: (ownerId: AccountId, runId: AgentRunId, now: AgentRun["createdAt"]) => Effect.Effect<AgentRun, AgentRunNotFound | ConversationsRepositoryError>
  readonly beginGeneration: (input: {
    readonly runId: AgentRunId
    readonly turnId: AgentTurnId
    readonly generationId: ModelGenerationId
    readonly provider: string
    readonly model: string
    readonly traceId: string
    readonly spanId: string
    readonly now: AgentRun["createdAt"]
  }) => Effect.Effect<void, ConversationsRepositoryError>
  readonly completeGeneration: (input: {
    readonly runId: AgentRunId
    readonly turnId: AgentTurnId
    readonly generationId: ModelGenerationId
    readonly text: string
    readonly inputTokens: number | null
    readonly outputTokens: number | null
    readonly cachedInputTokens: number | null
    readonly finishReason: string
    readonly now: AgentRun["createdAt"]
  }) => Effect.Effect<void, ConversationsRepositoryError>
  readonly failGeneration: (input: {
    readonly runId: AgentRunId
    readonly turnId: AgentTurnId
    readonly generationId: ModelGenerationId
    readonly errorCode: string
    readonly now: AgentRun["createdAt"]
  }) => Effect.Effect<void, ConversationsRepositoryError>
  readonly listOperations: () => Effect.Effect<ReadonlyArray<AiOperation>, ConversationsRepositoryError>
}>()("@proxus/backend-domain/modules/conversations/repository/ConversationsRepository") {}
