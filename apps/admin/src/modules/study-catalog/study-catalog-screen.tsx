import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  StudyNodeId,
  StudyNodeKind,
  StudyNodeStatus,
  type StudyEdge,
  type StudyNode,
} from "@proxus/shared/study-catalog"
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

import { Alert, AlertDescription, AlertTitle, AnimatedList } from "@proxus/ui/admin"
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
} from "@proxus/ui/admin"
import { Badge } from "@proxus/ui/admin"
import { Button } from "@proxus/ui/admin"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@proxus/ui/admin"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@proxus/ui/admin"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@proxus/ui/admin"
import { Field, FieldError, FieldLabel } from "@proxus/ui/admin"
import { Input } from "@proxus/ui/admin"
import {
  Item,
  ItemContent,
  ItemButton,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@proxus/ui/admin"
import { ScrollArea } from "@proxus/ui/admin"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@proxus/ui/admin"
import { Separator } from "@proxus/ui/admin"
import { Skeleton } from "@proxus/ui/admin"
import { Spinner } from "@proxus/ui/admin"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@proxus/ui/admin"
import { Box, Form, Grid, Heading, Inline, Stack, Text } from "@proxus/ui"
import { AdminPage, AdminSplitView } from "@proxus/ui/admin"
import {
  connectNodesMutationFamily,
  createNodeMutation,
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
    <Stack busy label="Cargando" gap="sm">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} />
      ))}
    </Stack>
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
            <SelectTrigger width="full"><SelectValue /></SelectTrigger>
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
            <SelectTrigger width="full">
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
            <SelectTrigger width="full"><SelectValue /></SelectTrigger>
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
    <Stack gap="md">
      <Inline align="stretch" gap="sm">
        <Select value={filter} onValueChange={selectFilter}>
          <SelectTrigger aria-label="Filtrar relaciones" width="full">
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
      </Inline>
      {visible.length === 0 ? (
        <Empty minHeight="md" border>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Network /></EmptyMedia>
            <EmptyTitle>Sin relaciones</EmptyTitle>
            <EmptyDescription>No hay relaciones de este tipo.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <AnimatedList>
            {visible.map((relation) => (
                <Item key={relation.edge.id} variant="outline">
                  <ItemMedia variant="icon">
                    {direction === "incoming" ? <ArrowDown /> : <ArrowUp />}
                  </ItemMedia>
                  <ItemContent>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => selectNode(relation.node)}
                    >
                      <ItemTitle>{relation.node.name}</ItemTitle>
                    </Button>
                    <ItemDescription>
                      {relationLabel[relation.edge._tag]} · posición {relation.edge.position}
                    </ItemDescription>
                  </ItemContent>
                  <Inline gap="xs">
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
                  </Inline>
                </Item>
            ))}
      </AnimatedList>
    </Stack>
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
  const mayRename = usePermission("studyNode:rename")
  const mayArchive = usePermission("studyNode:archive")

  if (detail._tag === "Failure") {
    return <ErrorAlert title="No se ha podido cargar el detalle" />
  }
  if (detail._tag !== "Success") {
    return <LoadingRows count={5} />
  }

  const node = detail.value
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
    <Stack gap="xl">
      <Stack gap="sm">
        <Inline gap="sm">
          <Badge variant="secondary">{kindLabel[node.kind]}</Badge>
          <Badge variant="outline">{node.status}</Badge>
        </Inline>
        <Heading level={2}>{node.name}</Heading>
        <Text size="xs" tone="muted" wrap="anywhere">{node.id}</Text>
        <Field>
          <FieldLabel>Estado</FieldLabel>
          <Inline gap="sm">
            <Select
              value={node.status}
              disabled={!mayArchive || waiting(statusMutation)}
              onValueChange={selectStatus}
            >
              <SelectTrigger aria-label="Estado del nodo" width="full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
                <SelectItem value="archived">Archivado</SelectItem>
              </SelectContent>
            </Select>
            {waiting(statusMutation) ? <Spinner /> : null}
          </Inline>
          {statusMutation._tag === "Failure"
            ? <FieldError>No se ha podido cambiar el estado.</FieldError>
            : null}
        </Field>
      </Stack>
      {mayRename ? <Form
        gap="md"
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
      </Form> : null}
      <Separator />
      <Stack as="section" gap="lg">
        <Stack gap="xs">
          <Heading level={3}>Relaciones</Heading>
          <Text size="sm" tone="muted">
            Gestiona padres e hijos compatibles.
          </Text>
        </Stack>
        <Tabs defaultValue="outgoing">
          <TabsList>
            <TabsTrigger value="incoming">Padres</TabsTrigger>
            <TabsTrigger value="outgoing">Hijos</TabsTrigger>
          </TabsList>
          <TabsContent value="incoming" paddingTop>
            <RelationList node={node} direction="incoming" />
          </TabsContent>
          <TabsContent value="outgoing" paddingTop>
            <RelationList node={node} direction="outgoing" />
          </TabsContent>
        </Tabs>
      </Stack>
    </Stack>
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
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const createNode = useAtomSet(createNodeMutation)
  const createResult = useAtomValue(createNodeMutation)
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
  const visibleNodes = nodes._tag === "Success"
    ? nodes.value.filter((node) => node.name.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")))
    : []

  return (
    <PermissionContext.Provider value={permissions}>
    <AdminPage id="nodes" title="Nodos de estudio" description="Gestiona el catálogo y sus relaciones." icon={<Network />} actions={
            <PermissionControl permission="studyCatalog:createNode">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild><Button><Plus />Crear nodo</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Crear {kindLabel[kind].toLocaleLowerCase("es")}</DialogTitle>
                    <DialogDescription>Se creará como borrador para que puedas conectarlo y revisarlo antes de publicarlo.</DialogDescription>
                  </DialogHeader>
                  <Field data-invalid={createResult._tag === "Failure"}>
                    <FieldLabel htmlFor="new-node-name">Nombre</FieldLabel>
                    <Input id="new-node-name" autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} />
                    {createResult._tag === "Failure" ? <FieldError>No se ha podido crear el nodo.</FieldError> : null}
                  </Field>
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                    <Button type="button" disabled={newName.trim().length === 0 || waiting(createResult)} onClick={() => createNode({ kind, name: newName })}>
                      {waiting(createResult) ? <Spinner /> : null}Crear borrador
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </PermissionControl>
    }>
        <AdminSplitView sidebar={
          <Card fill surface="muted">
            <CardHeader divider>
              <CardTitle>Nodos</CardTitle>
              <CardDescription>Filtra por tipo y estado.</CardDescription>
            </CardHeader>
            <CardContent layout="flow">
              <Grid columns="two" gap="sm">
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
              </Grid>
              <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre…" aria-label="Buscar nodos" />
              {nodes._tag === "Failure" ? (
                <ErrorAlert title="No se ha podido cargar el catálogo" />
              ) : nodes._tag !== "Success" ? (
                <LoadingRows />
              ) : visibleNodes.length === 0 ? (
                <Empty border>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
                    <EmptyTitle>Sin resultados</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ScrollArea fill>
                  <Stack gap="sm">
                    {visibleNodes.map((node) => (
                      <ItemButton
                        key={node.id}
                        selected={selectedNodeId === node.id}
                        type="button"
                        onClick={() => selectNode(node)}
                      >
                          <ItemContent>
                            <ItemTitle>{node.name}</ItemTitle>
                            <ItemDescription>{kindLabel[node.kind]}</ItemDescription>
                          </ItemContent>
                          <Badge variant="outline">{node.status}</Badge>
                      </ItemButton>
                    ))}
                  </Stack>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        } detail={
          <Card fill surface="muted">
            <CardHeader divider><CardTitle>Detalle</CardTitle></CardHeader>
            <CardContent layout="scroll">
              {selectedNodeId === null ? (
                <Empty minHeight="lg" border>
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
        } />
    </AdminPage>
    </PermissionContext.Provider>
  )
}
