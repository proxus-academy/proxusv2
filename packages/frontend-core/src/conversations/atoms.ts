import type { ThreadId } from "@proxus/shared/conversations"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PublicApiClient } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"

export const conversationThreadsQuery = applicationRuntime.atom(PublicApiClient.pipe(
  Effect.flatMap((client) => client.conversations.listThreads()),
))

export const conversationMessagesQuery = Atom.family((threadId: ThreadId) => applicationRuntime.atom(PublicApiClient.pipe(
  Effect.flatMap((client) => client.conversations.listMessages({ params: { threadId } })),
)))

export const createConversationThreadAction = applicationRuntime.fn((request: { readonly title: string; readonly onSuccess: (threadId: ThreadId) => void }, get) => PublicApiClient.pipe(
  Effect.flatMap((client) => client.conversations.createThread({ payload: { title: request.title } })),
  Effect.tap((thread) => Effect.sync(() => request.onSuccess(thread.id))),
  Effect.tap(() => Effect.sync(() => get.refresh(conversationThreadsQuery))),
))

export const sendConversationMessageAction = applicationRuntime.fn((request: { readonly threadId: ThreadId; readonly message: string }, get) => PublicApiClient.pipe(
  Effect.flatMap((client) => client.conversations.startRun({ params: { threadId: request.threadId }, payload: { message: request.message } })),
  Effect.tap(() => Effect.sync(() => get.refresh(conversationMessagesQuery(request.threadId)))),
))

export const refreshConversationMessagesAction = applicationRuntime.fn((threadId: ThreadId, get) => Effect.sync(() => get.refresh(conversationMessagesQuery(threadId))))
