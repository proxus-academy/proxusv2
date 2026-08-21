import { useAtomValue } from "@effect/atom-react"
import { AdminApi } from "@proxus/shared/admin-api"
import { Message, MessageContent, MessageScroller } from "@proxus/ui"
import { Context, Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { Activity, AlertTriangle, Clock, Coins } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"

type Client = HttpApiClient.ForApi<typeof AdminApi>
class OperationsClient extends Context.Service<OperationsClient, Client["aiOperations"]>()("@proxus/admin/modules/ai-operations/ai-operations-screen/OperationsClient") {}
const runtime = Atom.runtime(Layer.effect(OperationsClient, Effect.gen(function*() {
  return (yield* HttpApiClient.make(AdminApi, { baseUrl: "/admin-api" })).aiOperations
})).pipe(Layer.provide(FetchHttpClient.layer)))
const operationsAtom = runtime.atom(Effect.flatMap(OperationsClient, (client) => client.listOperations()))
const formatTokens = (input: number | null, output: number | null) => input === null && output === null ? "—" : `${input ?? 0} / ${output ?? 0}`

export function AiOperationsScreen() {
  const result = useAtomValue(operationsAtom)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const rows = result._tag === "Success" ? result.value : []
  const selected = rows.find((row) => row.runId === selectedId) ?? rows[0]
  return <main className="flex min-h-0 flex-1 p-4 md:p-6"><div className="mx-auto flex min-h-0 w-full max-w-[100rem] flex-1 flex-col gap-6">
    <header className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Activity className="size-5" /></span><div><h1 className="text-xl font-semibold md:text-2xl">Operaciones IA</h1><p className="text-sm text-muted-foreground">Runs, latencia, consumo y correlación de trazas.</p></div></header>
    {result._tag === "Failure" ? <Alert variant="destructive"><AlertTriangle className="size-4" /><AlertTitle>No se pudieron cargar las operaciones</AlertTitle><AlertDescription>Comprueba el rol de administrador y la conexión al backend.</AlertDescription></Alert> : null}
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[28rem_minmax(0,1fr)]">
      <Card className="min-h-0"><CardHeader><CardTitle>Runs recientes</CardTitle><CardDescription>Las 200 ejecuciones más recientes.</CardDescription></CardHeader><CardContent className="min-h-0 flex-1">{result._tag !== "Success" ? <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : <MessageScroller className="space-y-2 pr-3">{rows.map((row) => <Item asChild key={row.runId} variant={selected?.runId === row.runId ? "muted" : "outline"}><button onClick={() => setSelectedId(row.runId)}><ItemContent><ItemTitle>{row.threadTitle}</ItemTitle><ItemDescription>{row.model ?? "Pendiente"} · {formatTokens(row.inputTokens, row.outputTokens)} tokens</ItemDescription></ItemContent><Badge variant="outline">{row.status}</Badge></button></Item>)}</MessageScroller>}</CardContent></Card>
      <Card className="min-h-0"><CardHeader><CardTitle>Detalle del run</CardTitle><CardDescription>{selected?.runId ?? "Selecciona una operación"}</CardDescription></CardHeader><CardContent className="overflow-auto">{selected && <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Metric icon={Clock} label="Duración" value={selected.durationMillis === null ? "—" : `${selected.durationMillis} ms`} /><Metric icon={Coins} label="Coste" value={selected.costMicros === null ? "—" : `${(selected.costMicros / 1_000_000).toFixed(6)} USD`} /><Metric icon={Activity} label="Tokens E / S" value={formatTokens(selected.inputTokens, selected.outputTokens)} /></div><dl className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Proveedor / modelo</dt><dd>{selected.provider ?? "—"} / {selected.model ?? "—"}</dd></div><div><dt className="text-muted-foreground">Finalización</dt><dd>{selected.stopReason ?? "—"}</dd></div><div><dt className="text-muted-foreground">Thread</dt><dd className="font-mono text-xs">{selected.threadId}</dd></div><div><dt className="text-muted-foreground">Trace ID</dt><dd className="font-mono text-xs">{selected.traceId ?? "—"}</dd></div></dl><Message from="assistant"><MessageContent>Los inputs y outputs completos se mantienen fuera de esta vista; el admin muestra metadatos operativos seguros.</MessageContent></Message></div>}</CardContent></Card>
    </div>
  </div></main>
}

function Metric({ icon: Icon, label, value }: { readonly icon: typeof Activity; readonly label: string; readonly value: string }) { return <div className="rounded-xl border p-4"><Icon className="mb-2 size-4 text-muted-foreground" /><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div> }
