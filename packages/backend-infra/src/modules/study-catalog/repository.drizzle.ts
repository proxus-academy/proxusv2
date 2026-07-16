import {
  CountryNode,
  StudyEdge,
  StudyEdgeAlreadyExists,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeNotFound,
  StudyNode,
  StudyNodeNotFound,
  findStudyEdgeEndpointKindMismatch,
  type StudyEdge as StudyEdgeType,
  type StudyEdgeId,
  type StudyEdgesFromId,
  type StudyEdgesToId,
  type StudyNode as StudyNodeType,
  type StudyNodeId,
  type StudyNodeKind,
  type StudyNodeOfId,
  type StudyNodeSourcesOfId,
  type StudyNodeStatus,
  type StudyNodeTargetsOfId,
} from "@proxus/shared/study-catalog"
import { and, asc, eq, inArray } from "drizzle-orm"
import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { DateTime, Effect, Option, Schema } from "effect"
import {
  studyEdges,
  studyNodes,
  type StudyEdgeRow,
  type StudyNodeRow,
} from "../../database/schema.js"
import {
  StudyCatalogRepository,
  StudyCatalogRepositoryError,
} from "@proxus/backend-domain/study-catalog"

const repositoryError = (operation: string, cause: unknown) =>
  new StudyCatalogRepositoryError({ operation, cause })

const decodeNode = (row: StudyNodeRow): StudyNodeType =>
  Schema.decodeUnknownSync(StudyNode)({
    id: row.id,
    kind: row.kind,
    name: row.name,
    imageAssetId: row.imageAssetId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })

const decodeEdge = (row: StudyEdgeRow): StudyEdgeType =>
  Schema.decodeUnknownSync(StudyEdge)({
    _tag: row.kind,
    id: row.id,
    from: row.fromNodeId,
    to: row.toNodeId,
    position: row.position,
  })

const nodeValues = (node: StudyNodeType): typeof studyNodes.$inferInsert => ({
  id: node.id,
  kind: node.kind,
  name: node.name,
  imageAssetId: node.imageAssetId,
  status: node.status,
  createdAt: DateTime.toDateUtc(node.createdAt),
  updatedAt: DateTime.toDateUtc(node.updatedAt),
})

const edgeValues = (edge: StudyEdgeType): typeof studyEdges.$inferInsert => ({
  id: edge.id,
  kind: edge._tag,
  fromNodeId: edge.from,
  toNodeId: edge.to,
  position: edge.position,
})

type StudyDatabase = PgEffectDatabase<
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT
>

export const makeStudyCatalogRepositoryDrizzle = (db: StudyDatabase) => {
    const failRepository = (operation: string) =>
      Effect.mapError((cause: unknown) => repositoryError(operation, cause))

    const listNodes = (filters: {
      readonly kind: StudyNodeKind
      readonly status: StudyNodeStatus
    }) =>
      db
        .select()
        .from(studyNodes)
        .where(
          and(
            eq(studyNodes.kind, filters.kind),
            eq(studyNodes.status, filters.status),
          ),
        )
        .orderBy(asc(studyNodes.name), asc(studyNodes.id))
        .pipe(
          Effect.map((rows) => rows.map(decodeNode)),
          failRepository("listNodes"),
        )

    const listCountries = () =>
      db
        .select()
        .from(studyNodes)
        .where(
          and(
            eq(studyNodes.kind, "country"),
            eq(studyNodes.status, "published"),
          ),
        )
        .orderBy(asc(studyNodes.name), asc(studyNodes.id))
        .pipe(
          Effect.map(
            (rows) => rows.map(decodeNode) as ReadonlyArray<CountryNode>,
          ),
          failRepository("listCountries"),
        )

    const findNodeById = <Id extends StudyNodeId>(nodeId: Id) =>
      db
        .select()
        .from(studyNodes)
        .where(eq(studyNodes.id, nodeId))
        .limit(1)
        .pipe(
          Effect.map((rows) => Option.fromUndefinedOr(rows[0]).pipe(Option.map(decodeNode))),
          failRepository("findNodeById"),
          Effect.map((node) => node as Option.Option<StudyNodeOfId<Id>>),
        )

    const findEdgeById = (edgeId: StudyEdgeId) =>
      db
        .select()
        .from(studyEdges)
        .where(eq(studyEdges.id, edgeId))
        .limit(1)
        .pipe(
          Effect.map((rows) => Option.fromUndefinedOr(rows[0]).pipe(Option.map(decodeEdge))),
          failRepository("findEdgeById"),
        )

    const createNode = <Node extends StudyNodeType>(node: Node) =>
      db.insert(studyNodes).values(nodeValues(node)).returning().pipe(
        Effect.map((rows) => decodeNode(rows[0]! ) as Node),
        failRepository("createNode"),
      )

    const createEdge = <Edge extends StudyEdgeType>(
      edge: Edge,
      requestedPosition?: number,
    ) =>
      db.transaction((tx) =>
        Effect.gen(function*() {
          const endpoints = yield* tx.select().from(studyNodes).where(
            inArray(studyNodes.id, [edge.from, edge.to]),
          )
          const fromRow = endpoints.find(({ id }) => id === edge.from)
          const toRow = endpoints.find(({ id }) => id === edge.to)
          if (fromRow === undefined) return yield* new StudyNodeNotFound({ nodeId: edge.from })
          if (toRow === undefined) return yield* new StudyNodeNotFound({ nodeId: edge.to })

          const fromNode = decodeNode(fromRow)
          const toNode = decodeNode(toRow)
          const mismatch = findStudyEdgeEndpointKindMismatch(edge, fromNode, toNode)
          if (mismatch !== undefined) {
            const node = mismatch === "from" ? fromNode : toNode
            return yield* new StudyEdgeEndpointKindMismatch({
              edge, endpoint: mismatch, nodeId: node.id, actualKind: node.kind,
            })
          }

          const duplicate = yield* tx.select({ id: studyEdges.id }).from(studyEdges)
            .where(and(eq(studyEdges.kind, edge._tag), eq(studyEdges.fromNodeId, edge.from), eq(studyEdges.toNodeId, edge.to))).limit(1)
          if (duplicate.length > 0) return yield* new StudyEdgeAlreadyExists({ edge })

          const siblings = yield* tx.select().from(studyEdges)
            .where(and(eq(studyEdges.fromNodeId, edge.from), eq(studyEdges.kind, edge._tag)))
            .orderBy(asc(studyEdges.position), asc(studyEdges.id))
          const position = Math.min(requestedPosition ?? siblings.length, siblings.length)
          for (const [index, sibling] of siblings.entries()) {
            const next = index >= position ? index + 1 : index
            if (sibling.position !== next) {
              yield* tx.update(studyEdges).set({ position: next }).where(eq(studyEdges.id, sibling.id))
            }
          }
          const rows = yield* tx.insert(studyEdges).values(edgeValues({ ...edge, position })).returning()
          return decodeEdge(rows[0]!) as Edge
        }),
      ).pipe(Effect.mapError((error) => {
        switch (error._tag) {
          case "StudyNodeNotFound":
          case "StudyEdgeEndpointKindMismatch":
          case "StudyEdgeAlreadyExists":
            return error
          default:
            return repositoryError("createEdge", error)
        }
      }))

    const updateEdge = (
      edgeId: StudyEdgeId,
      input: { readonly from: StudyNodeId; readonly to: StudyNodeId; readonly position: number },
    ) => db.transaction((tx) => Effect.gen(function*() {
      const currentRows = yield* tx.select().from(studyEdges).where(eq(studyEdges.id, edgeId)).limit(1)
      const currentRow = currentRows[0]
      if (currentRow === undefined) return yield* new StudyEdgeNotFound({ edgeId })

      const candidate = Schema.decodeUnknownSync(StudyEdge)({
        _tag: currentRow.kind, id: edgeId, from: input.from, to: input.to, position: input.position,
      })
      const endpoints = yield* tx.select().from(studyNodes).where(inArray(studyNodes.id, [input.from, input.to]))
      const fromRow = endpoints.find(({ id }) => id === input.from)
      const toRow = endpoints.find(({ id }) => id === input.to)
      if (fromRow === undefined) return yield* new StudyNodeNotFound({ nodeId: input.from })
      if (toRow === undefined) return yield* new StudyNodeNotFound({ nodeId: input.to })
      const fromNode = decodeNode(fromRow)
      const toNode = decodeNode(toRow)
      const mismatch = findStudyEdgeEndpointKindMismatch(candidate, fromNode, toNode)
      if (mismatch !== undefined) {
        const node = mismatch === "from" ? fromNode : toNode
        return yield* new StudyEdgeEndpointKindMismatch({ edge: candidate, endpoint: mismatch, nodeId: node.id, actualKind: node.kind })
      }
      const duplicate = yield* tx.select({ id: studyEdges.id }).from(studyEdges)
        .where(and(eq(studyEdges.kind, candidate._tag), eq(studyEdges.fromNodeId, candidate.from), eq(studyEdges.toNodeId, candidate.to))).limit(1)
      if (duplicate.some(({ id }) => id !== edgeId)) return yield* new StudyEdgeAlreadyExists({ edge: candidate })

      const oldSiblings = yield* tx.select().from(studyEdges)
        .where(and(eq(studyEdges.fromNodeId, currentRow.fromNodeId), eq(studyEdges.kind, currentRow.kind)))
        .orderBy(asc(studyEdges.position), asc(studyEdges.id))
      const newSiblings = currentRow.fromNodeId === input.from
        ? oldSiblings.filter(({ id }) => id !== edgeId)
        : yield* tx.select().from(studyEdges)
          .where(and(eq(studyEdges.fromNodeId, input.from), eq(studyEdges.kind, currentRow.kind)))
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
      for (const [index, sibling] of oldSiblings.filter(({ id }) => id !== edgeId).entries()) {
        if (sibling.position !== index) yield* tx.update(studyEdges).set({ position: index }).where(eq(studyEdges.id, sibling.id))
      }
      const position = Math.min(input.position, newSiblings.length)
      for (const [index, sibling] of newSiblings.entries()) {
        const next = index >= position ? index + 1 : index
        if (sibling.position !== next) yield* tx.update(studyEdges).set({ position: next }).where(eq(studyEdges.id, sibling.id))
      }
      const rows = yield* tx.update(studyEdges).set({ fromNodeId: input.from, toNodeId: input.to, position }).where(eq(studyEdges.id, edgeId)).returning()
      return decodeEdge(rows[0]!)
    })).pipe(Effect.mapError((error) => {
      switch (error._tag) {
        case "StudyEdgeNotFound":
        case "StudyNodeNotFound":
        case "StudyEdgeEndpointKindMismatch":
        case "StudyEdgeAlreadyExists":
          return error
        default:
          return repositoryError("updateEdge", error)
      }
    }))

    const removeEdge = (edgeId: StudyEdgeId) =>
      db.transaction((tx) => Effect.gen(function*() {
        const rows = yield* tx.delete(studyEdges).where(eq(studyEdges.id, edgeId)).returning()
        const removed = rows[0]
        if (removed === undefined) return yield* new StudyEdgeNotFound({ edgeId })
        const siblings = yield* tx.select().from(studyEdges)
          .where(and(eq(studyEdges.fromNodeId, removed.fromNodeId), eq(studyEdges.kind, removed.kind)))
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
        for (const [index, sibling] of siblings.entries()) {
          if (sibling.position !== index) yield* tx.update(studyEdges).set({ position: index }).where(eq(studyEdges.id, sibling.id))
        }
      })).pipe(
        Effect.mapError((error) => error._tag === "StudyEdgeNotFound"
          ? error
          : repositoryError("removeEdge", error)),
        Effect.asVoid,
      )

    const renameNode = <Id extends StudyNodeId>(
      nodeId: Id,
      name: string,
      updatedAt: StudyNodeType["updatedAt"],
    ) =>
      db
        .update(studyNodes)
        .set({ name, updatedAt: DateTime.toDateUtc(updatedAt) })
        .where(eq(studyNodes.id, nodeId))
        .returning()
        .pipe(
          failRepository("renameNode"),
          Effect.flatMap((rows) =>
            rows[0] === undefined
              ? Effect.fail(new StudyNodeNotFound({ nodeId }))
              : Effect.succeed(decodeNode(rows[0]) as StudyNodeOfId<Id>),
          ),
        )

    const updateNodeStatus = <Id extends StudyNodeId>(
      nodeId: Id,
      status: StudyNodeStatus,
      updatedAt: StudyNodeType["updatedAt"],
    ) =>
      db
        .update(studyNodes)
        .set({ status, updatedAt: DateTime.toDateUtc(updatedAt) })
        .where(eq(studyNodes.id, nodeId))
        .returning()
        .pipe(
          failRepository("updateNodeStatus"),
          Effect.flatMap((rows) =>
            rows[0] === undefined
              ? Effect.fail(new StudyNodeNotFound({ nodeId }))
              : Effect.succeed(decodeNode(rows[0]) as StudyNodeOfId<Id>),
          ),
        )

    const ensureNode = (nodeId: StudyNodeId) =>
      findNodeById(nodeId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new StudyNodeNotFound({ nodeId })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const listOutgoingEdges = <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) =>
      ensureNode(sourceNodeId).pipe(
        Effect.andThen(
          db
            .select()
            .from(studyEdges)
            .where(eq(studyEdges.fromNodeId, sourceNodeId))
            .orderBy(asc(studyEdges.position), asc(studyEdges.id))
            .pipe(failRepository("listOutgoingEdges")),
        ),
        Effect.map((rows) => rows.map(decodeEdge) as unknown as ReadonlyArray<StudyEdgesFromId<Id>>),
      )

    const listIncomingEdges = <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) =>
      ensureNode(targetNodeId).pipe(
        Effect.andThen(
          db
            .select()
            .from(studyEdges)
            .where(eq(studyEdges.toNodeId, targetNodeId))
            .orderBy(asc(studyEdges.position), asc(studyEdges.id))
            .pipe(failRepository("listIncomingEdges")),
        ),
        Effect.map((rows) => rows.map(decodeEdge) as unknown as ReadonlyArray<StudyEdgesToId<Id>>),
      )

    const listTargets = <Id extends StudyNodeId>(sourceNodeId: Id) =>
      ensureNode(sourceNodeId).pipe(
        Effect.andThen(
          db
            .select({ node: studyNodes })
            .from(studyEdges)
            .innerJoin(studyNodes, eq(studyNodes.id, studyEdges.toNodeId))
            .where(eq(studyEdges.fromNodeId, sourceNodeId))
            .orderBy(asc(studyEdges.position), asc(studyEdges.id))
            .pipe(failRepository("listTargets")),
        ),
        Effect.map(
          (rows) =>
            rows.map(({ node }) => decodeNode(node)) as unknown as ReadonlyArray<
              StudyNodeTargetsOfId<Id>
            >,
        ),
      )

    const listChildren = <Id extends StudyNodeId>(input: {
      readonly parentId: Id
      readonly relationshipKinds: ReadonlyArray<StudyEdgeType["_tag"]>
    }) => {
      if (input.relationshipKinds.length === 0) {
        return Effect.succeed(
          [] as unknown as ReadonlyArray<StudyNodeTargetsOfId<Id>>,
        )
      }

      return db
        .select({ node: studyNodes })
        .from(studyEdges)
        .innerJoin(studyNodes, eq(studyNodes.id, studyEdges.toNodeId))
        .where(
          and(
            eq(studyEdges.fromNodeId, input.parentId),
            inArray(studyEdges.kind, input.relationshipKinds),
            eq(studyNodes.status, "published"),
          ),
        )
        .orderBy(asc(studyEdges.position), asc(studyEdges.id))
        .pipe(
          failRepository("listChildren"),
          Effect.map(
            (rows) =>
              rows.map(({ node }) => decodeNode(node)) as unknown as ReadonlyArray<
                StudyNodeTargetsOfId<Id>
              >,
          ),
        )
    }

    const listSources = <Id extends StudyNodeId>(targetNodeId: Id) =>
      ensureNode(targetNodeId).pipe(
        Effect.andThen(
          db
            .select({ node: studyNodes })
            .from(studyEdges)
            .innerJoin(studyNodes, eq(studyNodes.id, studyEdges.fromNodeId))
            .where(eq(studyEdges.toNodeId, targetNodeId))
            .orderBy(asc(studyEdges.position), asc(studyEdges.id))
            .pipe(failRepository("listSources")),
        ),
        Effect.map(
          (rows) =>
            rows.map(({ node }) => decodeNode(node)) as unknown as ReadonlyArray<
              StudyNodeSourcesOfId<Id>
            >,
        ),
      )

    return StudyCatalogRepository.of({
      listNodes,
      listCountries,
      findNodeById,
      findEdgeById,
      createNode,
      createEdge,
      updateEdge,
      removeEdge,
      renameNode,
      updateNodeStatus,
      listOutgoingEdges,
      listIncomingEdges,
      listTargets,
      listChildren,
      listSources,
    })
}
