import { ConversationsRepository, ConversationsRepositoryError } from "@proxus/backend-domain/conversations"
import {
  AgentRun,
  AgentRunInProgress,
  AgentRunNotFound,
  ConversationMessage,
  ConversationThread,
  ThreadNotFound,
} from "@proxus/shared/conversations"
import { AiOperation } from "@proxus/shared/ai-operations"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { DateTime, Effect, Option, Schema } from "effect"
import {
  conversationAgentRuns,
  conversationMessages,
  conversationThreads,
  agentTurns,
  modelGenerations,
  type ConversationAgentRunRow,
  type ConversationMessageRow,
  type ConversationThreadRow,
} from "../../database/schema.js"

type Database = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>

const repositoryError = (operation: string, cause: unknown) => new ConversationsRepositoryError({ operation, cause })
const date = DateTime.toDateUtc

const decodeThread = (row: ConversationThreadRow) => Schema.decodeUnknownEffect(ConversationThread)({
  id: row.id,
  ownerId: row.ownerId,
  title: row.title,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const decodeMessage = (row: ConversationMessageRow) => Schema.decodeUnknownEffect(ConversationMessage)({
  id: row.id,
  threadId: row.threadId,
  runId: row.runId,
  role: row.role,
  sequence: Number(row.sequence),
  status: row.status,
  text: row.text,
  createdAt: row.createdAt.toISOString(),
  completedAt: row.completedAt?.toISOString() ?? null,
})

const decodeRun = (row: ConversationAgentRunRow) => Schema.decodeUnknownEffect(AgentRun)({
  id: row.id,
  threadId: row.threadId,
  status: row.status,
  stopReason: row.stopReason,
  createdAt: row.createdAt.toISOString(),
  startedAt: row.startedAt?.toISOString() ?? null,
  finishedAt: row.finishedAt?.toISOString() ?? null,
})

export const makeConversationsRepositoryDrizzle = (db: Database) => ConversationsRepository.of({
  createThread: (thread) => db.insert(conversationThreads).values({
    id: thread.id,
    ownerId: thread.ownerId,
    title: thread.title,
    createdAt: date(thread.createdAt),
    updatedAt: date(thread.updatedAt),
  }).returning().pipe(
    Effect.flatMap((rows) => {
      const row = rows[0]
      return row === undefined ? Effect.die("INSERT conversation thread returned no row") : decodeThread(row)
    }),
    Effect.mapError((cause) => repositoryError("createThread", cause)),
  ),
  listThreads: (ownerId) => db.select().from(conversationThreads).where(and(
    eq(conversationThreads.ownerId, ownerId),
    isNull(conversationThreads.deletedAt),
  )).orderBy(desc(conversationThreads.updatedAt), desc(conversationThreads.id)).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeThread)),
    Effect.mapError((cause) => repositoryError("listThreads", cause)),
  ),
  findThread: (ownerId, threadId) => db.select().from(conversationThreads).where(and(
    eq(conversationThreads.id, threadId),
    eq(conversationThreads.ownerId, ownerId),
    isNull(conversationThreads.deletedAt),
  )).limit(1).pipe(
    Effect.flatMap((rows) => Option.fromIterable(rows).pipe(Option.match({
      onNone: () => Effect.succeed(Option.none()),
      onSome: (row) => decodeThread(row).pipe(Effect.map(Option.some)),
    }))),
    Effect.mapError((cause) => repositoryError("findThread", cause)),
  ),
  renameThread: (ownerId, threadId, title, updatedAt) => db.update(conversationThreads).set({
    title,
    updatedAt: date(updatedAt),
  }).where(and(eq(conversationThreads.id, threadId), eq(conversationThreads.ownerId, ownerId), isNull(conversationThreads.deletedAt))).returning().pipe(
    Effect.flatMap((rows) => Effect.gen(function*() {
      const row = rows[0]
      if (row === undefined) return yield* new ThreadNotFound({ threadId })
      return yield* decodeThread(row)
    })),
    Effect.mapError((cause) => Schema.is(ThreadNotFound)(cause) ? cause : repositoryError("renameThread", cause)),
  ),
  deleteThread: (ownerId, threadId, deletedAt) => db.update(conversationThreads).set({
    deletedAt: date(deletedAt),
    updatedAt: date(deletedAt),
  }).where(and(eq(conversationThreads.id, threadId), eq(conversationThreads.ownerId, ownerId), isNull(conversationThreads.deletedAt))).returning({ id: conversationThreads.id }).pipe(
    Effect.flatMap((rows) => rows.length === 0 ? Effect.fail(new ThreadNotFound({ threadId })) : Effect.void),
    Effect.mapError((cause) => Schema.is(ThreadNotFound)(cause) ? cause : repositoryError("deleteThread", cause)),
  ),
  listMessages: (ownerId, threadId) => db.select({ message: conversationMessages }).from(conversationMessages)
    .innerJoin(conversationThreads, eq(conversationMessages.threadId, conversationThreads.id))
    .where(and(eq(conversationThreads.id, threadId), eq(conversationThreads.ownerId, ownerId), isNull(conversationThreads.deletedAt)))
    .orderBy(asc(conversationMessages.sequence)).pipe(
      Effect.flatMap((rows) => Effect.gen(function*() {
        if (rows.length > 0) return yield* Effect.forEach(rows, ({ message }) => decodeMessage(message))
        const threads = yield* db.select({ id: conversationThreads.id }).from(conversationThreads).where(and(eq(conversationThreads.id, threadId), eq(conversationThreads.ownerId, ownerId), isNull(conversationThreads.deletedAt))).limit(1)
        if (threads.length === 0) return yield* new ThreadNotFound({ threadId })
        return []
      })),
      Effect.mapError((cause) => Schema.is(ThreadNotFound)(cause) ? cause : repositoryError("listMessages", cause)),
    ),
  startRun: (input) => db.transaction((tx) => Effect.gen(function*() {
    yield* tx.execute(sql`select ${conversationThreads.id} from ${conversationThreads} where ${conversationThreads.id} = ${input.threadId} for update`)
    const threads = yield* tx.select().from(conversationThreads).where(and(
      eq(conversationThreads.id, input.threadId),
      eq(conversationThreads.ownerId, input.ownerId),
      isNull(conversationThreads.deletedAt),
    )).limit(1)
    const thread = threads[0]
    if (thread === undefined) return yield* new ThreadNotFound({ threadId: input.threadId })
    const active = yield* tx.select({ id: conversationAgentRuns.id }).from(conversationAgentRuns).where(and(
      eq(conversationAgentRuns.threadId, input.threadId),
      inArray(conversationAgentRuns.status, ["queued", "running"]),
    )).limit(1)
    if (active.length > 0) return yield* new AgentRunInProgress({ threadId: input.threadId })
    const runRows = yield* tx.insert(conversationAgentRuns).values({
      id: input.runId,
      threadId: input.threadId,
      status: "queued",
      agentVersion: "conversation-agent/v1",
      maximumTurns: 8,
      maximumToolCalls: 16,
      createdAt: date(input.now),
    }).returning()
    const first = thread.nextMessageSequence
    yield* tx.insert(conversationMessages).values([
      { id: input.userMessageId, threadId: input.threadId, runId: input.runId, role: "user", sequence: first, status: "committed", text: input.message, createdAt: date(input.now), completedAt: date(input.now) },
      { id: input.assistantMessageId, threadId: input.threadId, runId: input.runId, role: "assistant", sequence: first + 1n, status: "streaming", text: "", createdAt: date(input.now) },
    ])
    yield* tx.update(conversationThreads).set({ nextMessageSequence: first + 2n, updatedAt: date(input.now) }).where(eq(conversationThreads.id, input.threadId))
    const runRow = runRows[0]
    if (runRow === undefined) return yield* Effect.die("INSERT agent run returned no row")
    return yield* decodeRun(runRow)
  })).pipe(Effect.mapError((cause) =>
    Schema.is(ThreadNotFound)(cause) || Schema.is(AgentRunInProgress)(cause) ? cause : repositoryError("startRun", cause))),
  findRun: (ownerId, runId) => db.select({ run: conversationAgentRuns }).from(conversationAgentRuns)
    .innerJoin(conversationThreads, eq(conversationAgentRuns.threadId, conversationThreads.id))
    .where(and(eq(conversationAgentRuns.id, runId), eq(conversationThreads.ownerId, ownerId), isNull(conversationThreads.deletedAt))).limit(1).pipe(
      Effect.flatMap((rows) => Option.fromIterable(rows).pipe(Option.match({
        onNone: () => Effect.succeed(Option.none()),
        onSome: ({ run }) => decodeRun(run).pipe(Effect.map(Option.some)),
      }))),
      Effect.mapError((cause) => repositoryError("findRun", cause)),
    ),
  interruptRun: (ownerId, runId, now) => db.transaction((tx) => Effect.gen(function*() {
    const rows = yield* tx.update(conversationAgentRuns).set({
      status: "interrupted",
      interruptedBy: "user",
      stopReason: "interrupted",
      finishedAt: date(now),
    }).where(and(
      eq(conversationAgentRuns.id, runId),
      inArray(conversationAgentRuns.status, ["queued", "running"]),
      sql`exists (select 1 from ${conversationThreads} where ${conversationThreads.id} = ${conversationAgentRuns.threadId} and ${conversationThreads.ownerId} = ${ownerId} and ${conversationThreads.deletedAt} is null)`,
    )).returning()
      const row = rows[0]
      if (row === undefined) return yield* new AgentRunNotFound({ runId })
      yield* tx.update(agentTurns).set({ status: "interrupted", finishedAt: date(now) })
        .where(and(eq(agentTurns.runId, runId), eq(agentTurns.status, "running")))
      yield* tx.update(modelGenerations).set({ status: "interrupted", finishReason: "interrupted", finishedAt: date(now) })
        .where(and(eq(modelGenerations.runId, runId), eq(modelGenerations.status, "running")))
      yield* tx.update(conversationMessages).set({ status: "interrupted", completedAt: date(now) })
        .where(and(eq(conversationMessages.runId, runId), eq(conversationMessages.status, "streaming")))
      return yield* decodeRun(row)
    })).pipe(
    Effect.mapError((cause) => Schema.is(AgentRunNotFound)(cause) ? cause : repositoryError("interruptRun", cause)),
  ),
  beginGeneration: (input) => db.transaction((tx) => Effect.gen(function*() {
    yield* tx.update(conversationAgentRuns).set({
      status: "running",
      startedAt: date(input.now),
      traceId: input.traceId,
      spanId: input.spanId,
    }).where(and(eq(conversationAgentRuns.id, input.runId), eq(conversationAgentRuns.status, "queued")))
    yield* tx.insert(agentTurns).values({
      id: input.turnId,
      runId: input.runId,
      ordinal: 1,
      status: "running",
      createdAt: date(input.now),
      startedAt: date(input.now),
    })
    yield* tx.insert(modelGenerations).values({
      id: input.generationId,
      runId: input.runId,
      turnId: input.turnId,
      attempt: 1,
      provider: input.provider,
      model: input.model,
      traceId: input.traceId,
      spanId: input.spanId,
      status: "running",
      createdAt: date(input.now),
      startedAt: date(input.now),
    })
  })).pipe(
    Effect.mapError((cause) => repositoryError("beginGeneration", cause)),
  ),
  completeGeneration: (input) => db.transaction((tx) => Effect.gen(function*() {
    yield* tx.update(modelGenerations).set({
      status: "completed",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedInputTokens: input.cachedInputTokens,
      usageSource: input.inputTokens === null ? null : "provider",
      finishReason: input.finishReason,
      finishedAt: date(input.now),
    }).where(and(eq(modelGenerations.id, input.generationId), eq(modelGenerations.status, "running")))
    yield* tx.update(agentTurns).set({ status: "completed", decision: "respond", finishedAt: date(input.now) })
      .where(and(eq(agentTurns.id, input.turnId), eq(agentTurns.status, "running")))
    yield* tx.update(conversationMessages).set({ status: "completed", text: input.text, completedAt: date(input.now) })
      .where(and(eq(conversationMessages.runId, input.runId), eq(conversationMessages.role, "assistant"), eq(conversationMessages.status, "streaming")))
    yield* tx.update(conversationAgentRuns).set({ status: "completed", stopReason: "response", finishedAt: date(input.now) })
      .where(and(eq(conversationAgentRuns.id, input.runId), eq(conversationAgentRuns.status, "running")))
  })).pipe(Effect.mapError((cause) => repositoryError("completeGeneration", cause))),
  failGeneration: (input) => db.transaction((tx) => Effect.gen(function*() {
    yield* tx.update(modelGenerations).set({ status: "failed", errorCode: input.errorCode, finishedAt: date(input.now) })
      .where(and(eq(modelGenerations.id, input.generationId), eq(modelGenerations.status, "running")))
    yield* tx.update(agentTurns).set({ status: "failed", finishedAt: date(input.now) })
      .where(and(eq(agentTurns.id, input.turnId), eq(agentTurns.status, "running")))
    yield* tx.update(conversationMessages).set({ status: "failed", completedAt: date(input.now) })
      .where(and(eq(conversationMessages.runId, input.runId), eq(conversationMessages.role, "assistant"), eq(conversationMessages.status, "streaming")))
    yield* tx.update(conversationAgentRuns).set({ status: "failed", errorCode: input.errorCode, stopReason: "error", finishedAt: date(input.now) })
      .where(and(eq(conversationAgentRuns.id, input.runId), inArray(conversationAgentRuns.status, ["queued", "running"])))
  })).pipe(Effect.mapError((cause) => repositoryError("failGeneration", cause))),
  listOperations: () => db.select({
    run: conversationAgentRuns,
    thread: conversationThreads,
    generation: modelGenerations,
  }).from(conversationAgentRuns)
    .innerJoin(conversationThreads, eq(conversationAgentRuns.threadId, conversationThreads.id))
    .leftJoin(modelGenerations, and(eq(modelGenerations.runId, conversationAgentRuns.id), eq(modelGenerations.attempt, 1)))
    .orderBy(desc(conversationAgentRuns.createdAt), desc(conversationAgentRuns.id))
    .limit(200).pipe(
      Effect.flatMap((rows) => Effect.forEach(rows, ({ run, thread, generation }) => Schema.decodeUnknownEffect(AiOperation)({
        runId: run.id,
        threadId: thread.id,
        ownerId: thread.ownerId,
        threadTitle: thread.title,
        status: run.status,
        provider: generation?.provider ?? null,
        model: generation?.model ?? null,
        inputTokens: generation?.inputTokens ?? null,
        outputTokens: generation?.outputTokens ?? null,
        costMicros: generation === null ? null : generation.costMicrosUsd === null ? null : Number(generation.costMicrosUsd),
        durationMillis: run.startedAt === null || run.finishedAt === null ? null : run.finishedAt.getTime() - run.startedAt.getTime(),
        stopReason: run.stopReason,
        errorCode: run.errorCode,
        traceId: run.traceId,
        createdAt: run.createdAt.toISOString(),
      }))),
      Effect.mapError((cause) => repositoryError("listOperations", cause)),
    ),
})
