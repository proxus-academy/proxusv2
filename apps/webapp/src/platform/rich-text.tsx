import { Fragment, type ReactElement, type ReactNode } from "react"

/** Renders the explicitly supported markup emitted by an already-localized message. */
export function RichText({ message, components }: Readonly<{
  message: string
  components: Readonly<Record<"terms" | "privacy", (children: string) => ReactElement>>
}>) {
  const parts: ReactNode[] = []
  const pattern = /<(terms|privacy)>(.*?)<\/\1>/g
  let cursor = 0
  for (const match of message.matchAll(pattern)) {
    const index = match.index ?? 0
    const tag = match[1]
    const content = match[2] ?? ""
    parts.push(message.slice(cursor, index))
    if (tag === "terms" || tag === "privacy") {
      parts.push(<Fragment key={`${tag}-${index}`}>{components[tag](content)}</Fragment>)
    }
    cursor = index + match[0].length
  }
  parts.push(message.slice(cursor))
  return <>{parts}</>
}
