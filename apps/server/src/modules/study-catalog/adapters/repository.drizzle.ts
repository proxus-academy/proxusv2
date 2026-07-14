import {
  StudyEdge,
  StudyEdgeAlreadyExists,
  StudyEdgeNotFound,
  StudyNode,
  StudyNodeNotFound,
  type AnyStudyNodeId,
  type StudyEdge as StudyEdgeType,
  type StudyEdgeId,
  type StudyEdgesFromId,
  type StudyEdgesToId,
  type StudyNode as StudyNodeType,
  type StudyNodeOfId,
  type StudyNodeSourcesOfId,
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
} from "../../../infrastructure/database/schema.js"
import {
  StudyCatalogRepository,
  StudyCatalogRepositoryError,
} from "../repository.js"

const repositoryError = (operation: string, cause: unknown) =>
  new StudyCatalogRepositoryError({ operation, cause })

const decodeNode = (row: StudyNodeRow): StudyNodeType =>
  Schema.decodeUnknownSync(StudyNode)({
    id: row.id,
    kind: row.kind,
    name: row.name,
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

    const findNodeById = <Id extends AnyStudyNodeId>(nodeId: Id) =>
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

    const createEdge = <Edge extends StudyEdgeType>(edge: Edge) =>
      db.transaction((tx) =>
        Effect.gen(function*() {
          const endpoints = yield* tx
            .select({ id: studyNodes.id })
            .from(studyNodes)
            .where(inArray(studyNodes.id, [edge.from, edge.to]))

          if (!endpoints.some(({ id }) => id === edge.from)) {
            return yield* new StudyNodeNotFound({ nodeId: edge.from })
          }
          if (!endpoints.some(({ id }) => id === edge.to)) {
            return yield* new StudyNodeNotFound({ nodeId: edge.to })
          }

          const duplicate = yield* tx
            .select({ id: studyEdges.id })
            .from(studyEdges)
            .where(
              and(
                eq(studyEdges.kind, edge._tag),
                eq(studyEdges.fromNodeId, edge.from),
                eq(studyEdges.toNodeId, edge.to),
              ),
            )
            .limit(1)

          if (duplicate.length > 0) {
            return yield* new StudyEdgeAlreadyExists({ edge })
          }

          const rows = yield* tx
            .insert(studyEdges)
            .values(edgeValues(edge))
            .returning()
          return decodeEdge(rows[0]!) as Edge
        }),
      ).pipe(
        Effect.mapError((error) => {
          switch (error._tag) {
            case "StudyNodeNotFound":
            case "StudyEdgeAlreadyExists":
              return error
            default:
              return repositoryError("createEdge", error)
          }
        }),
      )

    const removeEdge = (edgeId: StudyEdgeId) =>
      db.delete(studyEdges).where(eq(studyEdges.id, edgeId)).returning().pipe(
        failRepository("removeEdge"),
        Effect.flatMap((rows) =>
          rows.length === 0
            ? Effect.fail(new StudyEdgeNotFound({ edgeId }))
            : Effect.void,
        ),
      )

    const renameNode = <Id extends AnyStudyNodeId>(
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

    const archiveNode = <Id extends AnyStudyNodeId>(
      nodeId: Id,
      updatedAt: StudyNodeType["updatedAt"],
    ) =>
      db
        .update(studyNodes)
        .set({ status: "archived", updatedAt: DateTime.toDateUtc(updatedAt) })
        .where(eq(studyNodes.id, nodeId))
        .returning()
        .pipe(
          failRepository("archiveNode"),
          Effect.flatMap((rows) =>
            rows[0] === undefined
              ? Effect.fail(new StudyNodeNotFound({ nodeId }))
              : Effect.succeed(decodeNode(rows[0]) as StudyNodeOfId<Id>),
          ),
        )

    const ensureNode = (nodeId: AnyStudyNodeId) =>
      findNodeById(nodeId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new StudyNodeNotFound({ nodeId })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const listOutgoingEdges = <Id extends StudyEdgeType["from"]>(
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

    const listIncomingEdges = <Id extends StudyEdgeType["to"]>(
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

    const listTargets = <Id extends StudyEdgeType["from"]>(sourceNodeId: Id) =>
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

    const listSources = <Id extends StudyEdgeType["to"]>(targetNodeId: Id) =>
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
      findNodeById,
      findEdgeById,
      createNode,
      createEdge,
      removeEdge,
      renameNode,
      archiveNode,
      listOutgoingEdges,
      listIncomingEdges,
      listTargets,
      listSources,
    })
}
