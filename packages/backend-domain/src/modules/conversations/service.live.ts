import {
  AgentRunNotFound,
  ConversationThread,
  ThreadNotFound,
  makeAgentRunId,
  makeAgentTurnId,
  makeMessageId,
  makeModelGenerationId,
  makeThreadId,
  type AgentRunId,
  type ThreadId,
} from "@proxus/shared/conversations"
import type { AccountId } from "@proxus/shared/auth"
import { Array, Clock, DateTime, Effect, Layer, Option, Random, Stream } from "effect"
import { ConversationGeneration } from "./generation.js"
import { ConversationsRepository } from "./repository.js"
import { Conversations } from "./service.js"

const randomUuid = Effect.gen(function*() {
  const bytes = yield* Effect.forEach(Array.makeBy(16, (index) => index), (index) =>
    Random.nextIntBetween(0, 255).pipe(Effect.map((byte) =>
      index === 6 ? (byte & 0x0f) | 0x40 : index === 8 ? (byte & 0x3f) | 0x80 : byte)))
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0"))
  return [hex.slice(0, 4).join(""), hex.slice(4, 6).join(""), hex.slice(6, 8).join(""), hex.slice(8, 10).join(""), hex.slice(10).join("")].join("-")
})

interface GenerationResult {
  readonly text: string
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly cachedInputTokens: number | null
  readonly finishReason: string
}
const initialGenerationResult = (): GenerationResult => ({ text: "", inputTokens: null, outputTokens: null, cachedInputTokens: null, finishReason: "stop" })

export const ConversationsLive = Layer.effect(Conversations, Effect.gen(function*() {
  const repository = yield* ConversationsRepository
  const generation = yield* ConversationGeneration
  const now = Clock.currentTimeMillis.pipe(Effect.map(DateTime.makeUnsafe))

  const getThread = (ownerId: AccountId, threadId: ThreadId) => repository.findThread(ownerId, threadId).pipe(
    Effect.flatMap(Option.match({
      onNone: () => Effect.fail(new ThreadNotFound({ threadId })),
      onSome: Effect.succeed,
    })),
  )

  return Conversations.of({
    createThread: (ownerId, title) => Effect.gen(function*() {
      const createdAt = yield* now
      return yield* repository.createThread(new ConversationThread({
        id: makeThreadId(yield* randomUuid),
        ownerId,
        title,
        createdAt,
        updatedAt: createdAt,
      }))
    }),
    listThreads: repository.listThreads,
    getThread,
    renameThread: (ownerId, threadId, title) => now.pipe(Effect.flatMap((updatedAt) => repository.renameThread(ownerId, threadId, title, updatedAt))),
    deleteThread: (ownerId, threadId) => now.pipe(Effect.flatMap((deletedAt) => repository.deleteThread(ownerId, threadId, deletedAt))),
    listMessages: repository.listMessages,
    startRun: (ownerId, threadId, message) => Effect.gen(function*() {
      const startedAt = yield* now
      const run = yield* repository.startRun({
        ownerId,
        threadId,
        runId: makeAgentRunId(yield* randomUuid),
        userMessageId: makeMessageId(yield* randomUuid),
        assistantMessageId: makeMessageId(yield* randomUuid),
        message,
        now: startedAt,
      })
      const turnId = makeAgentTurnId(yield* randomUuid)
      const generationId = makeModelGenerationId(yield* randomUuid)
      const execute = Effect.gen(function*() {
        const generationStartedAt = yield* now
        const span = yield* Effect.currentSpan
        yield* repository.beginGeneration({
          runId: run.id,
          turnId,
          generationId,
          provider: generation.provider,
          model: generation.model,
          traceId: span.traceId,
          spanId: span.spanId,
          now: generationStartedAt,
        })
        const history = yield* repository.listMessages(ownerId, threadId)
        const result = yield* generation.generate(history.flatMap((entry) =>
          entry.text === null || entry.text === "" || entry.role === "tool"
            ? []
            : [{ role: entry.role, content: entry.text }] as const)).pipe(
              Stream.runFold(initialGenerationResult, (state, event) => {
                switch (event._tag) {
                  case "TextDelta": return { ...state, text: state.text + event.delta }
                  case "Usage": return { ...state, inputTokens: event.inputTokens, outputTokens: event.outputTokens, cachedInputTokens: event.cachedInputTokens }
                  case "Finished": return { ...state, finishReason: event.reason }
                }
              }),
            )
        const completedAt = yield* now
        yield* repository.completeGeneration({ runId: run.id, turnId, generationId, ...result, now: completedAt })
      }).pipe(
        Effect.withSpan("ai.agent.run", { attributes: { "ai.run.id": run.id, "ai.thread.id": threadId, "ai.provider": generation.provider, "ai.model": generation.model } }),
        Effect.catch((cause) => now.pipe(
          Effect.flatMap((failedAt) => repository.failGeneration({ runId: run.id, turnId, generationId, errorCode: "generation_failed", now: failedAt })),
          Effect.tap(() => Effect.logError("Conversation generation failed", { runId: run.id, cause })),
          Effect.ignore,
        )),
      )
      yield* Effect.forkDetach(execute)
      return run
    }),
    getRun: (ownerId, runId) => repository.findRun(ownerId, runId).pipe(
      Effect.flatMap(Option.match({
        onNone: () => Effect.fail(new AgentRunNotFound({ runId })),
        onSome: Effect.succeed,
      })),
    ),
    interruptRun: (ownerId, runId: AgentRunId) => now.pipe(Effect.flatMap((finishedAt) => repository.interruptRun(ownerId, runId, finishedAt))),
  })
}))
