import { Badge, Button, EmptyState, Input, SegmentedControl, Text } from "@proxus/ui"
import { useState } from "react"
import { CreatorIcon } from "./icons.js"
import { Section, VideoRow } from "./shared.js"
import type { CreatorVideo } from "./types.js"

type VideoFilter = "all" | "campaign" | "trial"

const filterOptions = [
  { value: "all", label: "Todos" },
  { value: "campaign", label: "Campañas" },
  { value: "trial", label: "Trial" },
] as const

export function CreatorVideos({
  videos,
  canUpload,
  onUpload,
}: {
  readonly videos: ReadonlyArray<CreatorVideo>
  readonly canUpload: boolean
  readonly onUpload: () => void
}) {
  const [filter, setFilter] = useState<VideoFilter>("all")
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase("es")
  const filteredVideos = videos.filter((video) => {
    const matchesContext =
      filter === "all" ||
      (filter === "trial" && video.context === "Trial") ||
      (filter === "campaign" && video.context !== "Trial")
    const matchesQuery =
      normalizedQuery === "" ||
      video.title.toLocaleLowerCase("es").includes(normalizedQuery) ||
      video.context.toLocaleLowerCase("es").includes(normalizedQuery)
    return matchesContext && matchesQuery
  })

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge variant="primary">Tu contenido</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Vídeos</h1>
          <Text className="mt-2 max-w-xl" tone="muted">
            Todo lo que has publicado durante tus pruebas y campañas. Cada contenido agrupa su publicación de TikTok e Instagram.
          </Text>
        </div>
        {canUpload ? (
          <Button size="lg" icon={<CreatorIcon name="upload" className="size-5" />} onClick={onUpload}>
            Subir vídeo
          </Button>
        ) : null}
      </header>

      <Section title="Historial" description="6 vídeos · 139,8 mil visualizaciones">
        <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            className="max-w-full overflow-x-auto"
            options={filterOptions}
            value={filter}
            onChange={setFilter}
          />
          <Input
            className="h-10 lg:w-72"
            aria-label="Buscar vídeos"
            placeholder="Buscar por título o campaña"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        {filteredVideos.length === 0 ? (
          <EmptyState
            title="No encontramos vídeos"
            description="Prueba con otra búsqueda o cambia el filtro."
            icon={<CreatorIcon name="video" className="size-6" />}
          />
        ) : (
          <div>
            {filteredVideos.map((video) => (
              <VideoRow key={video.id} video={video} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
