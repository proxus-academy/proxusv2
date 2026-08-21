import { createFileRoute } from "@tanstack/react-router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { conversationMessagesQuery, conversationThreadsQuery, createConversationThreadAction, refreshConversationMessagesAction, sendConversationMessageAction } from "@proxus/frontend-core/conversations"
import type { ThreadId } from "@proxus/shared/conversations"
import { Conversation, ConversationEmptyState, Message, MessageContent, MessageScroller, PromptInput, PromptInputAttach, PromptInputSubmit, PromptInputToolbar } from "@proxus/ui"
import { MessageSquarePlus } from "lucide-react"
import { useEffect, useState } from "react"

export const Route = createFileRoute("/_authenticated/app")({
  component: HomePage,
})

export function HomePage() {
  const threads = useAtomValue(conversationThreadsQuery)
  const createThread = useAtomSet(createConversationThreadAction)
  const [selectedId, setSelectedId] = useState<ThreadId | null>(null)
  const selected = selectedId ?? (threads._tag === "Success" ? threads.value[0]?.id ?? null : null)
  return (
    <main className="grid h-screen min-h-0 bg-background text-foreground md:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r p-3"><button className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={() => createThread({ title: "Nueva conversación", onSuccess: setSelectedId })}><MessageSquarePlus className="size-4" />Nueva conversación</button><div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">{threads._tag === "Success" && threads.value.map((thread) => <button key={thread.id} onClick={() => setSelectedId(thread.id)} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${selected === thread.id ? "bg-muted font-medium" : "hover:bg-muted/60"}`}>{thread.title}</button>)}</div></aside>
      {selected === null ? <ConversationEmptyState /> : <ChatThread threadId={selected} />}
    </main>
  )
}

function ChatThread({ threadId }: { readonly threadId: ThreadId }) {
  const messages = useAtomValue(conversationMessagesQuery(threadId))
  const send = useAtomSet(sendConversationMessageAction)
  const sending = useAtomValue(sendConversationMessageAction)
  const refresh = useAtomSet(refreshConversationMessagesAction)
  const values = messages._tag === "Success" ? messages.value : []
  const running = values.some((message) => message.status === "streaming")
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => refresh(threadId), 750)
    return () => window.clearInterval(timer)
  }, [refresh, running, threadId])
  return <Conversation className="mx-auto w-full max-w-4xl p-4"><MessageScroller className="px-2">{values.length === 0 ? <ConversationEmptyState /> : values.map((message) => <Message key={message.id} from={message.role}><MessageContent>{message.text}{message.status === "streaming" ? " ▍" : ""}</MessageContent></Message>)}</MessageScroller><PromptInput className="mt-3" onSubmit={(message) => send({ threadId, message })}><PromptInputToolbar><PromptInputAttach disabled title="Los adjuntos se activarán al completar la subida" /><PromptInputSubmit disabled={sending.waiting} running={running} /></PromptInputToolbar></PromptInput></Conversation>
}
