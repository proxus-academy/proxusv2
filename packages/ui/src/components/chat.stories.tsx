import type { Meta, StoryObj } from "@storybook/react-vite"
import { Attachment, Conversation, Reasoning, Tool } from "./chat-parts.js"
import { Message, MessageActions, MessageContent } from "./message.js"
import { MessageScroller } from "./message-scroller.js"
import { PromptInput, PromptInputAttach, PromptInputSubmit, PromptInputToolbar } from "./prompt-input.js"

const meta = { title: "Chat/Conversation", component: Conversation, tags: ["autodocs"] } satisfies Meta<typeof Conversation>
export default meta
type Story = StoryObj<typeof meta>

export const Complete: Story = { render: () => <Conversation className="h-[36rem] max-w-3xl rounded-xl border p-4">
  <MessageScroller><Message from="user"><MessageContent>Explícame la fotosíntesis.</MessageContent><MessageActions /></Message><Message from="assistant"><MessageContent>Las plantas convierten luz, agua y dióxido de carbono en energía química.</MessageContent></Message><Reasoning>Identifiqué que conviene una explicación introductoria.</Reasoning><Tool name="search_notes" status="completed">{"{ results: 3 }"}</Tool><Attachment name="apuntes-biologia.pdf" meta="1.4 MB · PDF" /></MessageScroller>
  <PromptInput><PromptInputToolbar><PromptInputAttach /><PromptInputSubmit /></PromptInputToolbar></PromptInput>
</Conversation> }
