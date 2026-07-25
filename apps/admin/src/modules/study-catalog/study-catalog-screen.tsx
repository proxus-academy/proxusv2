import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  StudyNodeId,
  StudyNodeKind,
  StudyNodeStatus,
  type StudyEdge,
  type StudyNode,
} from "@proxus/shared/study-catalog"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowDown,
  ArrowUp,
  Network,
  Plus,
  SearchX,
  Settings2,
  Trash2,
} from "lucide-react"
import { createContext, type ReactNode, useContext, useState } from "react"
import { Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  connectNodesMutationFamily,
  disconnectEdgeMutationFamily,
  renameNodeMutationFamily,
  updateEdgeMutationFamily,
  updateNodeStatusMutationFamily,
} from "./mutations.js"
import {
  incomingRelationsFamily,
  nodeFamily,
  nodesFamily,
  outgoingRelationsFamily,
  type NodeFilterKey,
  type NodeRelation,
} from "./queries.js"
import {
  edgeKinds,
  incomingTagFilterFamily,
  isStudyEdgeTag,
  nodeKindFilterAtom,
  nodeStatusFilterAtom,
  outgoingEdgeTags,
  outgoingTagFilterFamily,
  renameValueFamily,
  selectedNodeIdAtom,
  selectNodeAtom,
} from "./state.js"

const kindLabel = {
  country: "País",
  type: "Tipo",
  university: "Universidad",
  degree: "Grado",
  subject: "Asignatura",
} satisfies Record<StudyNodeKind, string>

const relationLabel = {
  CountryTypeEdge: "País → tipo",
  TypeUniversityEdge: "Tipo → universidad",
  UniversityDegreeEdge: "Universidad → grado",
  UniversitySubjectEdge: "Universidad → asignatura",
  DegreeSubjectEdge: "Grado → asignatura",
} satisfies Record<StudyEdge["_tag"], string>

const nodeKinds = [
  "country",
  "type",
  "university",
  "degree",
  "subject",
] as const satisfies ReadonlyArray<StudyNodeKind>
const isStudyNodeId = Schema.is(StudyNodeId)
const isStudyNodeKind = Schema.is(StudyNodeKind)
const isStudyNodeStatus = Schema.is(StudyNodeStatus)
const waiting = AsyncResult.isWaiting
const PermissionContext = createContext<ReadonlySet<string>>(new Set())
const usePermission = (permission: string) => useContext(PermissionContext).has(permission)
function PermissionControl({ permission, children }: { readonly permission: string; readonly children: ReactNode }) {
  return usePermission(permission) ? <>{children}</> : null
}

function LoadingRows({ count = 4 }: { readonly count?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando" className="space-y-2">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  )
}

function ErrorAlert({ title }: { readonly title: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>Inténtalo de nuevo más tarde.</AlertDescription>
    </Alert>
  )
}

function ConnectDialog({ node }: { readonly node: StudyNode }) {
  const permitted = usePermission("studyCatalog:connect")
  const tags = outgoingEdgeTags(node.kind)
  const [tag, setTag] = useState<StudyEdge["_tag"] | null>(tags[0] ?? null)
  const [targetId, setTargetId] = useState<StudyNodeId | null>(null)
  const targetKind = tag === null ? null : edgeKinds[tag].to
  const candidateFilterKey: NodeFilterKey = `${targetKind ?? "country"}:published`
  const mutationAtom = connectNodesMutationFamily(node.id)
  const candidates = useAtomValue(nodesFamily(candidateFilterKey))
  const connect = useAtomSet(mutationAtom)
  const mutation = useAtomValue(mutationAtom)

  if (!permitted || tags.length === 0) {
    return null
  }

  const available = candidates._tag === "Success"
    ? candidates.value.filter((candidate) => candidate.id !== node.id)
    : []
  const selectTag = (value: string) => {
    if (isStudyEdgeTag(value)) {
      setTag(value)
      setTargetId(null)
    }
  }
  const selectTarget = (value: string) => {
    if (isStudyNodeId(value)) {
      setTargetId(value)
    }
  }
  const connectSelected = () => {
    if (tag === null || targetId === null) {
      return
    }
    connect({ edge: { _tag: tag, from: node.id, to: targetId } })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm"><Plus />Conectar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar hijo</DialogTitle>
          <DialogDescription>
            Selecciona un tipo permitido y un nodo compatible.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Tipo de relación</FieldLabel>
          <Select value={tag ?? undefined} onValueChange={selectTag}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tags.map((value) => (
                <SelectItem key={value} value={value}>
                  {relationLabel[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Nodo hijo</FieldLabel>
          <Select value={targetId ?? undefined} onValueChange={selectTarget}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un nodo" />
            </SelectTrigger>
            <SelectContent>
              {available.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {candidates._tag === "Failure"
            ? <FieldError>No se pudieron cargar los candidatos.</FieldError>
            : null}
        </Field>
        {mutation._tag === "Failure" ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo conectar</AlertTitle>
            <AlertDescription>
              Comprueba que la relación no exista ya.
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            type="button"
            disabled={tag === null || targetId === null || waiting(mutation)}
            onClick={connectSelected}
          >
            {waiting(mutation) ? <Spinner /> : null}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditRelationDialog({ relation }: { readonly relation: NodeRelation }) {
  const edge = relation.edge
  const parentKind = edgeKinds[edge._tag].from
  const mutationAtom = updateEdgeMutationFamily(edge.id)
  const parents = useAtomValue(nodesFamily(`${parentKind}:published`))
  const [parentId, setParentId] = useState<StudyNodeId>(edge.from)
  const update = useAtomSet(mutationAtom)
  const mutation = useAtomValue(mutationAtom)
  const candidates = parents._tag === "Success" ? parents.value : []
  const selectParent = (value: string) => {
    if (isStudyNodeId(value)) {
      setParentId(value)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label={`Editar relación con ${relation.node.name}`}
        >
          <Settings2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar relación</DialogTitle>
          <DialogDescription>
            Mueve la relación a otro padre compatible. El orden solo se cambia
            desde relaciones salientes.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Padre</FieldLabel>
          <Select value={parentId} onValueChange={selectParent}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {candidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {parents._tag === "Failure"
            ? <FieldError>No se pudieron cargar los padres.</FieldError>
            : null}
        </Field>
        {mutation._tag === "Failure" ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo editar</AlertTitle>
            <AlertDescription>
              Puede que la relación ya exista en ese padre.
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            type="button"
            disabled={waiting(mutation)}
            onClick={() => update({
              previousFrom: edge.from,
              previousTo: edge.to,
              from: parentId,
              to: edge.to,
              position: edge.position,
            })}
          >
            {waiting(mutation) ? <Spinner /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DisconnectButton({ relation }: { readonly relation: NodeRelation }) {
  const mutationAtom = disconnectEdgeMutationFamily(relation.edge.id)
  const disconnect = useAtomSet(mutationAtom)
  const mutation = useAtomValue(mutationAtom)

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="destructive"
          aria-label={`Desconectar ${relation.node.name}`}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desconectar relación?</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará la relación con {relation.node.name}. El nodo no se eliminará.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={waiting(mutation)}
            onClick={() => disconnect({
              from: relation.edge.from,
              to: relation.edge.to,
            })}
          >
            Desconectar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReorderButtons({
  edge,
  nodeName,
  position,
  lastPosition,
}: {
  readonly edge: StudyEdge
  readonly nodeName: string
  readonly position: number
  readonly lastPosition: number
}) {
  const mutationAtom = updateEdgeMutationFamily(edge.id)
  const update = useAtomSet(mutationAtom)
  const mutation = useAtomValue(mutationAtom)
  const reorder = (nextPosition: number) => update({
    previousFrom: edge.from,
    previousTo: edge.to,
    from: edge.from,
    to: edge.to,
    position: nextPosition,
  })

  return (
    <>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label={`Subir ${nodeName}`}
        disabled={position <= 0 || waiting(mutation)}
        onClick={() => reorder(position - 1)}
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label={`Bajar ${nodeName}`}
        disabled={position >= lastPosition || waiting(mutation)}
        onClick={() => reorder(position + 1)}
      >
        <ArrowDown />
      </Button>
    </>
  )
}

function RelationList({
  node,
  direction,
}: {
  readonly node: StudyNode
  readonly direction: "incoming" | "outgoing"
}) {
  const result = useAtomValue(
    direction === "incoming"
      ? incomingRelationsFamily(node.id)
      : outgoingRelationsFamily(node.id),
  )
  const filterAtom = direction === "incoming"
    ? incomingTagFilterFamily(node.id)
    : outgoingTagFilterFamily(node.id)
  const filter = useAtomValue(filterAtom)
  const setFilter = useAtomSet(filterAtom)
  const selectNode = useAtomSet(selectNodeAtom)

  if (result._tag === "Failure") {
    return <ErrorAlert title="No se han podido cargar las relaciones" />
  }
  if (result._tag !== "Success") {
    return <LoadingRows count={3} />
  }

  const tags = [...new Set(result.value.map(({ edge }) => edge._tag))]
  const visible = filter === "all"
    ? result.value
    : result.value.filter(({ edge }) => edge._tag === filter)
  const orderedSiblings = (edge: StudyEdge) => result.value
    .filter((relation) => relation.edge._tag === edge._tag)
    .sort((left, right) => left.edge.position - right.edge.position)
  const siblingIndex = (edge: StudyEdge) => orderedSiblings(edge)
    .findIndex((relation) => relation.edge.id === edge.id)
  const selectFilter = (value: string) => {
    if (value === "all" || isStudyEdgeTag(value)) {
      setFilter(value)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select value={filter} onValueChange={selectFilter}>
          <SelectTrigger aria-label="Filtrar relaciones" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag} value={tag}>{relationLabel[tag]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {direction === "outgoing" ? <ConnectDialog node={node} /> : null}
      </div>
      {visible.length === 0 ? (
        <Empty className="min-h-36 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Network /></EmptyMedia>
            <EmptyTitle>Sin relaciones</EmptyTitle>
            <EmptyDescription>No hay relaciones de este tipo.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {visible.map((relation) => (
              <motion.div
                key={relation.edge.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{
                  layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                }}
              >
                <Item variant="outline">
                  <ItemMedia variant="icon">
                    {direction === "incoming" ? <ArrowDown /> : <ArrowUp />}
                  </ItemMedia>
                  <ItemContent>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => selectNode(relation.node)}
                    >
                      <ItemTitle>{relation.node.name}</ItemTitle>
                    </button>
                    <ItemDescription>
                      {relationLabel[relation.edge._tag]} · posición {relation.edge.position}
                    </ItemDescription>
                  </ItemContent>
                  <div className="flex gap-1">
                    {direction === "outgoing" ? (
                      <PermissionControl permission="studyCatalog:connect"><ReorderButtons
                        edge={relation.edge}
                        nodeName={relation.node.name}
                        position={siblingIndex(relation.edge)}
                        lastPosition={orderedSiblings(relation.edge).length - 1}
                      /></PermissionControl>
                    ) : null}
                    <PermissionControl permission="studyCatalog:connect"><EditRelationDialog relation={relation} /></PermissionControl>
                    <PermissionControl permission="studyEdge:disconnect"><DisconnectButton relation={relation} /></PermissionControl>
                  </div>
                </Item>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function NodeDetail({
  nodeId,
  filterKey,
}: {
  readonly nodeId: StudyNodeId
  readonly filterKey: NodeFilterKey
}) {
  const renameMutationAtom = renameNodeMutationFamily(nodeId)
  const statusMutationAtom = updateNodeStatusMutationFamily(nodeId)
  const detail = useAtomValue(nodeFamily(nodeId))
  const name = useAtomValue(renameValueFamily(nodeId))
  const setName = useAtomSet(renameValueFamily(nodeId))
  const rename = useAtomSet(renameMutationAtom)
  const mutation = useAtomValue(renameMutationAtom)
  const updateStatus = useAtomSet(statusMutationAtom)
  const statusMutation = useAtomValue(statusMutationAtom)

  if (detail._tag === "Failure") {
    return <ErrorAlert title="No se ha podido cargar el detalle" />
  }
  if (detail._tag !== "Success") {
    return <LoadingRows count={5} />
  }

  const node = detail.value
  const mayRename = usePermission("studyNode:rename")
  const mayArchive = usePermission("studyNode:archive")
  const selectStatus = (value: string) => {
    if (isStudyNodeStatus(value)) {
      updateStatus({
        kind: node.kind,
        previousStatus: node.status,
        status: value,
      })
    }
  }
  const trimmedName = name.trim()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Badge variant="secondary">{kindLabel[node.kind]}</Badge>
          <Badge variant="outline">{node.status}</Badge>
        </div>
        <h2 className="text-2xl font-semibold">{node.name}</h2>
        <p className="break-all text-xs text-muted-foreground">{node.id}</p>
        <Field>
          <FieldLabel>Estado</FieldLabel>
          <div className="flex items-center gap-2">
            <Select
              value={node.status}
              disabled={!mayArchive || waiting(statusMutation)}
              onValueChange={selectStatus}
            >
              <SelectTrigger aria-label="Estado del nodo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
                <SelectItem value="archived">Archivado</SelectItem>
              </SelectContent>
            </Select>
            {waiting(statusMutation) ? <Spinner /> : null}
          </div>
          {statusMutation._tag === "Failure"
            ? <FieldError>No se ha podido cambiar el estado.</FieldError>
            : null}
        </Field>
      </div>
      {mayRename ? <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          rename({ name, filterKey })
        }}
      >
        <Field data-invalid={mutation._tag === "Failure"}>
          <FieldLabel htmlFor="node-name">Nombre</FieldLabel>
          <Input
            id="node-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {mutation._tag === "Failure"
            ? <FieldError>No se ha podido guardar.</FieldError>
            : null}
        </Field>
        <Button
          type="submit"
          disabled={
            waiting(mutation) ||
            trimmedName.length === 0 ||
            trimmedName === node.name
          }
        >
          {waiting(mutation) ? <Spinner /> : null}
          Guardar nombre
        </Button>
      </form> : null}
      <Separator />
      <section className="space-y-4">
        <div>
          <h3 className="font-semibold">Relaciones</h3>
          <p className="text-sm text-muted-foreground">
            Gestiona padres e hijos compatibles.
          </p>
        </div>
        <Tabs defaultValue="outgoing">
          <TabsList>
            <TabsTrigger value="incoming">Padres</TabsTrigger>
            <TabsTrigger value="outgoing">Hijos</TabsTrigger>
          </TabsList>
          <TabsContent value="incoming" className="pt-3">
            <RelationList node={node} direction="incoming" />
          </TabsContent>
          <TabsContent value="outgoing" className="pt-3">
            <RelationList node={node} direction="outgoing" />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  )
}

export function StudyCatalogScreen({ permissions }: { readonly permissions: ReadonlySet<string> }) {
  const kind = useAtomValue(nodeKindFilterAtom)
  const status = useAtomValue(nodeStatusFilterAtom)
  const setKind = useAtomSet(nodeKindFilterAtom)
  const setStatus = useAtomSet(nodeStatusFilterAtom)
  const filterKey: NodeFilterKey = `${kind}:${status}`
  const nodes = useAtomValue(nodesFamily(filterKey))
  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const selectNode = useAtomSet(selectNodeAtom)
  const selectKind = (value: string) => {
    if (isStudyNodeKind(value)) {
      setKind(value)
    }
  }
  const selectStatus = (value: string) => {
    if (isStudyNodeStatus(value)) {
      setStatus(value)
    }
  }

  return (
    <PermissionContext.Provider value={permissions}>
    <main id="nodes" className="flex min-h-0 flex-1 p-4 md:p-6">
      <div className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col gap-6">
        <header className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Network className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              Nodos de estudio
            </h1>
            <p className="text-sm text-muted-foreground">
              Gestiona el catálogo y sus relaciones.
            </p>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-1">
          <Card className="min-h-0 rounded-lg border border-border bg-card/60 shadow-sm">
            <CardHeader className="border-b">
              <CardTitle>Nodos</CardTitle>
              <CardDescription>Filtra por tipo y estado.</CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                <Select value={kind} onValueChange={selectKind}>
                  <SelectTrigger aria-label="Tipo de nodo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {nodeKinds.map((value) => (
                      <SelectItem key={value} value={value}>{kindLabel[value]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={selectStatus}>
                  <SelectTrigger aria-label="Estado"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="published">Publicado</SelectItem>
                    <SelectItem value="archived">Archivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {nodes._tag === "Failure" ? (
                <ErrorAlert title="No se ha podido cargar el catálogo" />
              ) : nodes._tag !== "Success" ? (
                <LoadingRows />
              ) : nodes.value.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
                    <EmptyTitle>Sin resultados</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-2 pr-3">
                    {nodes.value.map((node) => (
                      <Item
                        key={node.id}
                        asChild
                        variant={selectedNodeId === node.id ? "muted" : "outline"}
                        className={selectedNodeId === node.id
                          ? "border-primary/25 bg-primary/10"
                          : "hover:border-primary/20 hover:bg-accent/50"}
                      >
                        <button type="button" onClick={() => selectNode(node)}>
                          <ItemContent>
                            <ItemTitle>{node.name}</ItemTitle>
                            <ItemDescription>{kindLabel[node.kind]}</ItemDescription>
                          </ItemContent>
                          <Badge variant="outline">{node.status}</Badge>
                        </button>
                      </Item>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
          <Card className="min-h-0 rounded-lg border border-border bg-card/60 shadow-sm">
            <CardHeader className="border-b"><CardTitle>Detalle</CardTitle></CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
              {selectedNodeId === null ? (
                <Empty className="min-h-80 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Network /></EmptyMedia>
                    <EmptyTitle>Selecciona un nodo</EmptyTitle>
                    <EmptyDescription>
                      Consulta sus datos y relaciones.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <NodeDetail
                  key={selectedNodeId}
                  nodeId={selectedNodeId}
                  filterKey={filterKey}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
    </PermissionContext.Provider>
  )
}
