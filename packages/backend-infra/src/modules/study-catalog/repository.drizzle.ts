import {
  CountryNode,
  CountryTypeEdge,
  DegreeNode,
  DegreeSubjectEdge,
  StudyEdge,
  StudyEdgeAlreadyExists,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeNotFound,
  StudyNode,
  StudyNodeId,
  StudyNodeNotFound,
  StudyTypeNode,
  SubjectNode,
  TypeUniversityEdge,
  UniversityDegreeEdge,
  UniversityNode,
  UniversitySubjectEdge,
  findStudyEdgeEndpointKindMismatch,
  type StudyEdge as StudyEdgeType,
  type StudyEdgeId,
  type StudyNode as StudyNodeType,
  type StudyNodeKind,
  type StudyNodeStatus,
} from "@proxus/shared/study-catalog"
import { and, asc, eq, inArray, sql } from "drizzle-orm"
import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from "drizzle-orm/effect-pglite"
import { alias } from "drizzle-orm/pg-core"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Data, DateTime, Effect, Option, Schema } from "effect"
import {
  studyEdges,
  studyNodes,
  users,
  type StudyEdgeRow,
  type StudyNodeRow,
} from "../../database/schema.js"
import {
  StudyCatalogRepository,
  StudyCatalogRepositoryError,
} from "@proxus/backend-domain/study-catalog"

const repositoryError = (operation: string, cause: unknown) =>
  new StudyCatalogRepositoryError({ operation, cause })

const nodeRowInput = (row: StudyNodeRow) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  imageAssetId: row.imageAssetId,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const edgeRowInput = (row: StudyEdgeRow) => ({
  _tag: row.kind,
  id: row.id,
  from: row.fromNodeId,
  to: row.toNodeId,
  position: row.position,
})

const decodeNode = (row: StudyNodeRow) =>
  Schema.decodeUnknownEffect(StudyNode)(nodeRowInput(row))

const decodeCountryNode = (row: StudyNodeRow) =>
  Schema.decodeUnknownEffect(CountryNode)(nodeRowInput(row))

const decodeEdge = (row: StudyEdgeRow) =>
  Schema.decodeUnknownEffect(StudyEdge)(edgeRowInput(row))

const PersistedStudyEdge = Schema.Union([
  Schema.Struct({
    edge: CountryTypeEdge,
    fromNode: CountryNode,
    toNode: StudyTypeNode,
  }),
  Schema.Struct({
    edge: TypeUniversityEdge,
    fromNode: StudyTypeNode,
    toNode: UniversityNode,
  }),
  Schema.Struct({
    edge: UniversityDegreeEdge,
    fromNode: UniversityNode,
    toNode: DegreeNode,
  }),
  Schema.Struct({
    edge: UniversitySubjectEdge,
    fromNode: UniversityNode,
    toNode: SubjectNode,
  }),
  Schema.Struct({
    edge: DegreeSubjectEdge,
    fromNode: DegreeNode,
    toNode: SubjectNode,
  }),
])

type PersistedStudyEdgeRow = {
  readonly edge: StudyEdgeRow
  readonly fromNode: StudyNodeRow
  readonly toNode: StudyNodeRow
}

const decodePersistedStudyEdge = (row: PersistedStudyEdgeRow) =>
  Schema.decodeUnknownEffect(PersistedStudyEdge)({
    edge: edgeRowInput(row.edge),
    fromNode: nodeRowInput(row.fromNode),
    toNode: nodeRowInput(row.toNode),
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

class MissingReturnedRow extends Data.TaggedError("MissingReturnedRow")<{
  readonly operation: string
}> {}

const firstReturnedRow = <A>(operation: string, rows: ReadonlyArray<A>) =>
  Effect.fromOption(
    Option.fromIterable(rows),
    () => new MissingReturnedRow({ operation }),
  )

const fromStudyNodes = alias(studyNodes, "study_edge_from_node")
const toStudyNodes = alias(studyNodes, "study_edge_to_node")
const persistedEdgeSelection = {
  edge: studyEdges,
  fromNode: fromStudyNodes,
  toNode: toStudyNodes,
}

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
        Effect.flatMap((rows) => Effect.forEach(rows, decodeNode)),
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
        Effect.flatMap((rows) => Effect.forEach(rows, decodeCountryNode)),
        failRepository("listCountries"),
      )

  const userCountsByNodeIds = (nodeIds: ReadonlyArray<StudyNodeId>) => {
    if (nodeIds.length === 0) return Effect.succeed(new Map<StudyNodeId, number>())
    const CountRow = Schema.Struct({
      nodeId: StudyNodeId,
      userCount: Schema.Union([Schema.Number, Schema.NumberFromString]),
    })
    const CountResult = Schema.Union([Schema.Array(CountRow), Schema.Struct({ rows: Schema.Array(CountRow) })])
    return db.execute(sql`
      select assignments.node_id as "nodeId", count(distinct ${users.id})::int as "userCount"
      from ${users}
      cross join lateral (values (${users.studyId}), (${users.subjectId})) as assignments(node_id)
      where ${users.status} = 'active'
        and assignments.node_id in (${sql.join(nodeIds.map((id) => sql`${id}`), sql`, `)})
      group by assignments.node_id
    `).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(CountResult)),
      Effect.map((result) => {
        const rows = "rows" in result ? result.rows : result
        return new Map<StudyNodeId, number>(rows.map((row) => [row.nodeId, row.userCount]))
      }),
      failRepository("userCountsByNodeIds"),
    )
  }

  const findNodeById = (nodeId: StudyNodeId) =>
    db
      .select()
      .from(studyNodes)
      .where(eq(studyNodes.id, nodeId))
      .limit(1)
      .pipe(
        Effect.flatMap((rows) =>
          Option.fromIterable(rows).pipe(
            Option.match({
              onNone: () => Effect.succeed(Option.none<StudyNodeType>()),
              onSome: (row) => decodeNode(row).pipe(Effect.map(Option.some)),
            }),
          ),
        ),
        failRepository("findNodeById"),
      )

  const findEdgeById = (edgeId: StudyEdgeId) =>
    db
      .select(persistedEdgeSelection)
      .from(studyEdges)
      .innerJoin(
        fromStudyNodes,
        eq(fromStudyNodes.id, studyEdges.fromNodeId),
      )
      .innerJoin(toStudyNodes, eq(toStudyNodes.id, studyEdges.toNodeId))
      .where(eq(studyEdges.id, edgeId))
      .limit(1)
      .pipe(
        Effect.flatMap((rows) =>
          Option.fromIterable(rows).pipe(
            Option.match({
              onNone: () => Effect.succeed(Option.none<StudyEdgeType>()),
              onSome: (row) =>
                decodePersistedStudyEdge(row).pipe(
                  Effect.map(({ edge }) => Option.some(edge)),
                ),
            }),
          ),
        ),
        failRepository("findEdgeById"),
      )

  const createNode = (node: StudyNodeType) =>
    db.insert(studyNodes).values(nodeValues(node)).returning().pipe(
      Effect.flatMap((rows) => firstReturnedRow("createNode", rows)),
      Effect.flatMap(decodeNode),
      failRepository("createNode"),
    )

  const createEdge = (
    edge: StudyEdgeType,
    requestedPosition?: number,
  ) =>
    db.transaction((tx) =>
      Effect.gen(function*() {
        // The source node is the PostgreSQL lock key for every ordered edge
        // group under that source, independent of the relationship tag.
        yield* tx
          .select({ id: studyNodes.id })
          .from(studyNodes)
          .where(eq(studyNodes.id, edge.from))
          .orderBy(asc(studyNodes.id))
          .for("update")
        const endpoints = yield* tx
          .select()
          .from(studyNodes)
          .where(inArray(studyNodes.id, [edge.from, edge.to]))
        const fromRow = endpoints.find(({ id }) => id === edge.from)
        const toRow = endpoints.find(({ id }) => id === edge.to)
        if (fromRow === undefined) {
          return yield* new StudyNodeNotFound({ nodeId: edge.from })
        }
        if (toRow === undefined) {
          return yield* new StudyNodeNotFound({ nodeId: edge.to })
        }

        const fromNode = yield* decodeNode(fromRow)
        const toNode = yield* decodeNode(toRow)
        const mismatch = findStudyEdgeEndpointKindMismatch(
          edge,
          fromNode,
          toNode,
        )
        if (mismatch !== undefined) {
          const node = mismatch === "from" ? fromNode : toNode
          return yield* new StudyEdgeEndpointKindMismatch({
            edge,
            endpoint: mismatch,
            nodeId: node.id,
            actualKind: node.kind,
          })
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

        const siblings = yield* tx
          .select()
          .from(studyEdges)
          .where(
            and(
              eq(studyEdges.fromNodeId, edge.from),
              eq(studyEdges.kind, edge._tag),
            ),
          )
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
        const position = Math.min(
          requestedPosition ?? siblings.length,
          siblings.length,
        )
        for (const [index, sibling] of siblings.entries()) {
          const next = index >= position ? index + 1 : index
          if (sibling.position !== next) {
            yield* tx
              .update(studyEdges)
              .set({ position: next })
              .where(eq(studyEdges.id, sibling.id))
          }
        }

        const edgeAtPosition = yield* Schema.decodeUnknownEffect(StudyEdge)({
          ...edge,
          position,
        })
        const rows = yield* tx
          .insert(studyEdges)
          .values(edgeValues(edgeAtPosition))
          .returning()
        const row = yield* firstReturnedRow("createEdge", rows)
        return yield* decodeEdge(row)
      }),
    ).pipe(
      Effect.mapError((cause: unknown) => {
        if (
          Schema.is(StudyNodeNotFound)(cause) ||
          Schema.is(StudyEdgeEndpointKindMismatch)(cause) ||
          Schema.is(StudyEdgeAlreadyExists)(cause)
        ) {
          return cause
        }
        return repositoryError("createEdge", cause)
      }),
    )

  const updateEdgeAttempt = (
    edgeId: StudyEdgeId,
    input: {
      readonly from: StudyNodeId
      readonly to: StudyNodeId
      readonly position: number
    },
  ) =>
    db.transaction((tx) =>
      Effect.gen(function*() {
        // Read only to discover the lock keys. The source may change before the
        // locks are acquired, so it is verified again below.
        const observedRows = yield* tx
          .select()
          .from(studyEdges)
          .where(eq(studyEdges.id, edgeId))
          .limit(1)
        const observed = Option.fromIterable(observedRows)
        if (Option.isNone(observed)) {
          return yield* new StudyEdgeNotFound({ edgeId })
        }

        // Every edge writer takes all source rows first, in lexical UUID order,
        // and only then takes an edge row lock.
        const sourcesToLock = [
          ...new Set([
            observed.value.fromNodeId,
            input.from,
          ]),
        ].sort()
        yield* tx
          .select({ id: studyNodes.id })
          .from(studyNodes)
          .where(inArray(studyNodes.id, sourcesToLock))
          .orderBy(asc(studyNodes.id))
          .for("update")

        const currentRows = yield* tx
          .select()
          .from(studyEdges)
          .where(eq(studyEdges.id, edgeId))
          .limit(1)
          .for("update")
        const current = Option.fromIterable(currentRows)
        if (Option.isNone(current)) {
          return yield* new StudyEdgeNotFound({ edgeId })
        }
        if (current.value.fromNodeId !== observed.value.fromNodeId) {
          // Commit this no-op attempt to release its source locks. A fresh
          // transaction can then acquire the newly observed keys in global order.
          return Option.none<StudyEdgeType>()
        }

        const candidate = yield* Schema.decodeUnknownEffect(StudyEdge)({
          _tag: current.value.kind,
          id: edgeId,
          from: input.from,
          to: input.to,
          position: input.position,
        })
        const endpoints = yield* tx
          .select()
          .from(studyNodes)
          .where(inArray(studyNodes.id, [input.from, input.to]))
        const fromRow = endpoints.find(({ id }) => id === input.from)
        const toRow = endpoints.find(({ id }) => id === input.to)
        if (fromRow === undefined) {
          return yield* new StudyNodeNotFound({ nodeId: input.from })
        }
        if (toRow === undefined) {
          return yield* new StudyNodeNotFound({ nodeId: input.to })
        }
        const fromNode = yield* decodeNode(fromRow)
        const toNode = yield* decodeNode(toRow)
        const mismatch = findStudyEdgeEndpointKindMismatch(
          candidate,
          fromNode,
          toNode,
        )
        if (mismatch !== undefined) {
          const node = mismatch === "from" ? fromNode : toNode
          return yield* new StudyEdgeEndpointKindMismatch({
            edge: candidate,
            endpoint: mismatch,
            nodeId: node.id,
            actualKind: node.kind,
          })
        }

        const duplicate = yield* tx
          .select({ id: studyEdges.id })
          .from(studyEdges)
          .where(
            and(
              eq(studyEdges.kind, candidate._tag),
              eq(studyEdges.fromNodeId, candidate.from),
              eq(studyEdges.toNodeId, candidate.to),
            ),
          )
          .limit(1)
        if (duplicate.some(({ id }) => id !== edgeId)) {
          return yield* new StudyEdgeAlreadyExists({ edge: candidate })
        }

        const oldSiblings = yield* tx
          .select()
          .from(studyEdges)
          .where(
            and(
              eq(studyEdges.fromNodeId, current.value.fromNodeId),
              eq(studyEdges.kind, current.value.kind),
            ),
          )
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
        const newSiblings =
          current.value.fromNodeId === input.from
            ? oldSiblings.filter(({ id }) => id !== edgeId)
            : yield* tx
                .select()
                .from(studyEdges)
                .where(
                  and(
                    eq(studyEdges.fromNodeId, input.from),
                    eq(studyEdges.kind, current.value.kind),
                  ),
                )
                .orderBy(asc(studyEdges.position), asc(studyEdges.id))
        for (const [index, sibling] of oldSiblings
          .filter(({ id }) => id !== edgeId)
          .entries()) {
          if (sibling.position !== index) {
            yield* tx
              .update(studyEdges)
              .set({ position: index })
              .where(eq(studyEdges.id, sibling.id))
          }
        }
        const position = Math.min(input.position, newSiblings.length)
        for (const [index, sibling] of newSiblings.entries()) {
          const next = index >= position ? index + 1 : index
          if (sibling.position !== next) {
            yield* tx
              .update(studyEdges)
              .set({ position: next })
              .where(eq(studyEdges.id, sibling.id))
          }
        }
        const rows = yield* tx
          .update(studyEdges)
          .set({
            fromNodeId: input.from,
            toNodeId: input.to,
            position,
          })
          .where(eq(studyEdges.id, edgeId))
          .returning()
        const row = yield* firstReturnedRow("updateEdge", rows)
        return Option.some(yield* decodeEdge(row))
      }),
    )

  const updateEdge = (
    edgeId: StudyEdgeId,
    input: {
      readonly from: StudyNodeId
      readonly to: StudyNodeId
      readonly position: number
    },
  ) => updateEdgeAttempt(edgeId, input).pipe(
    Effect.repeat({ until: Option.isSome }),
    Effect.flatMap(Option.match({
      onNone: () => Effect.die("updateEdge retry stopped without a result"),
      onSome: Effect.succeed,
    })),
    Effect.mapError((cause: unknown) => {
      if (
        Schema.is(StudyEdgeNotFound)(cause) ||
        Schema.is(StudyNodeNotFound)(cause) ||
        Schema.is(StudyEdgeEndpointKindMismatch)(cause) ||
        Schema.is(StudyEdgeAlreadyExists)(cause)
      ) {
        return cause
      }
      return repositoryError("updateEdge", cause)
    }),
  )

  const removeEdgeAttempt = (edgeId: StudyEdgeId) =>
    db.transaction((tx) =>
      Effect.gen(function*() {
        const observedRows = yield* tx
          .select()
          .from(studyEdges)
          .where(eq(studyEdges.id, edgeId))
          .limit(1)
        const observed = Option.fromIterable(observedRows)
        if (Option.isNone(observed)) {
          return yield* new StudyEdgeNotFound({ edgeId })
        }

        yield* tx
          .select({ id: studyNodes.id })
          .from(studyNodes)
          .where(eq(studyNodes.id, observed.value.fromNodeId))
          .orderBy(asc(studyNodes.id))
          .for("update")
        const currentRows = yield* tx
          .select()
          .from(studyEdges)
          .where(eq(studyEdges.id, edgeId))
          .limit(1)
          .for("update")
        const current = Option.fromIterable(currentRows)
        if (Option.isNone(current)) {
          return yield* new StudyEdgeNotFound({ edgeId })
        }
        if (current.value.fromNodeId !== observed.value.fromNodeId) {
          return false
        }

        yield* tx.delete(studyEdges).where(eq(studyEdges.id, edgeId))
        const siblings = yield* tx
          .select()
          .from(studyEdges)
          .where(
            and(
              eq(studyEdges.fromNodeId, current.value.fromNodeId),
              eq(studyEdges.kind, current.value.kind),
            ),
          )
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
        for (const [index, sibling] of siblings.entries()) {
          if (sibling.position !== index) {
            yield* tx
              .update(studyEdges)
              .set({ position: index })
              .where(eq(studyEdges.id, sibling.id))
          }
        }
        return true
      }),
    )

  const removeEdge = (edgeId: StudyEdgeId) =>
    removeEdgeAttempt(edgeId).pipe(
      Effect.repeat({ until: (removed) => removed }),
      Effect.mapError((cause: unknown) =>
        Schema.is(StudyEdgeNotFound)(cause)
          ? cause
          : repositoryError("removeEdge", cause),
      ),
      Effect.asVoid,
    )

  const renameNode = (
    nodeId: StudyNodeId,
    name: string,
    updatedAt: StudyNodeType["updatedAt"],
  ) =>
    db
      .update(studyNodes)
      .set({ name, updatedAt: DateTime.toDateUtc(updatedAt) })
      .where(eq(studyNodes.id, nodeId))
      .returning()
      .pipe(
        Effect.flatMap((rows) =>
          Effect.fromOption(
            Option.fromIterable(rows),
            () => new StudyNodeNotFound({ nodeId }),
          ).pipe(Effect.flatMap(decodeNode)),
        ),
        Effect.mapError((cause: unknown) =>
          Schema.is(StudyNodeNotFound)(cause)
            ? cause
            : repositoryError("renameNode", cause),
        ),
      )

  const updateNodeStatus = (
    nodeId: StudyNodeId,
    status: StudyNodeStatus,
    updatedAt: StudyNodeType["updatedAt"],
  ) =>
    db
      .update(studyNodes)
      .set({ status, updatedAt: DateTime.toDateUtc(updatedAt) })
      .where(eq(studyNodes.id, nodeId))
      .returning()
      .pipe(
        Effect.flatMap((rows) =>
          Effect.fromOption(
            Option.fromIterable(rows),
            () => new StudyNodeNotFound({ nodeId }),
          ).pipe(Effect.flatMap(decodeNode)),
        ),
        Effect.mapError((cause: unknown) =>
          Schema.is(StudyNodeNotFound)(cause)
            ? cause
            : repositoryError("updateNodeStatus", cause),
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

  const listOutgoingEdges = (sourceNodeId: StudyNodeId) =>
    ensureNode(sourceNodeId).pipe(
      Effect.andThen(
        db
          .select(persistedEdgeSelection)
          .from(studyEdges)
          .innerJoin(
            fromStudyNodes,
            eq(fromStudyNodes.id, studyEdges.fromNodeId),
          )
          .innerJoin(toStudyNodes, eq(toStudyNodes.id, studyEdges.toNodeId))
          .where(eq(studyEdges.fromNodeId, sourceNodeId))
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
          .pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, decodePersistedStudyEdge),
            ),
            Effect.map((rows) => rows.map(({ edge }) => edge)),
            failRepository("listOutgoingEdges"),
          ),
      ),
    )

  const listIncomingEdges = (targetNodeId: StudyNodeId) =>
    ensureNode(targetNodeId).pipe(
      Effect.andThen(
        db
          .select(persistedEdgeSelection)
          .from(studyEdges)
          .innerJoin(
            fromStudyNodes,
            eq(fromStudyNodes.id, studyEdges.fromNodeId),
          )
          .innerJoin(toStudyNodes, eq(toStudyNodes.id, studyEdges.toNodeId))
          .where(eq(studyEdges.toNodeId, targetNodeId))
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
          .pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, decodePersistedStudyEdge),
            ),
            Effect.map((rows) => rows.map(({ edge }) => edge)),
            failRepository("listIncomingEdges"),
          ),
      ),
    )

  const listTargets = (sourceNodeId: StudyNodeId) =>
    ensureNode(sourceNodeId).pipe(
      Effect.andThen(
        db
          .select(persistedEdgeSelection)
          .from(studyEdges)
          .innerJoin(
            fromStudyNodes,
            eq(fromStudyNodes.id, studyEdges.fromNodeId),
          )
          .innerJoin(toStudyNodes, eq(toStudyNodes.id, studyEdges.toNodeId))
          .where(eq(studyEdges.fromNodeId, sourceNodeId))
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
          .pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, decodePersistedStudyEdge),
            ),
            Effect.map((rows) => rows.map(({ toNode }) => toNode)),
            failRepository("listTargets"),
          ),
      ),
    )

  const listChildren = (input: {
    readonly parentId: StudyNodeId
    readonly relationshipKinds: ReadonlyArray<StudyEdgeType["_tag"]>
  }): Effect.Effect<
    ReadonlyArray<StudyNodeType>,
    StudyCatalogRepositoryError
  > => {
    if (input.relationshipKinds.length === 0) {
      return Effect.succeed([])
    }

    return db
      .select(persistedEdgeSelection)
      .from(studyEdges)
      .innerJoin(
        fromStudyNodes,
        eq(fromStudyNodes.id, studyEdges.fromNodeId),
      )
      .innerJoin(toStudyNodes, eq(toStudyNodes.id, studyEdges.toNodeId))
      .where(
        and(
          eq(studyEdges.fromNodeId, input.parentId),
          inArray(studyEdges.kind, input.relationshipKinds),
          eq(toStudyNodes.status, "published"),
        ),
      )
      .orderBy(asc(studyEdges.position), asc(studyEdges.id))
      .pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, decodePersistedStudyEdge),
        ),
        Effect.map((rows) => rows.map(({ toNode }) => toNode)),
        failRepository("listChildren"),
      )
  }

  const listSources = (targetNodeId: StudyNodeId) =>
    ensureNode(targetNodeId).pipe(
      Effect.andThen(
        db
          .select(persistedEdgeSelection)
          .from(studyEdges)
          .innerJoin(
            fromStudyNodes,
            eq(fromStudyNodes.id, studyEdges.fromNodeId),
          )
          .innerJoin(toStudyNodes, eq(toStudyNodes.id, studyEdges.toNodeId))
          .where(eq(studyEdges.toNodeId, targetNodeId))
          .orderBy(asc(studyEdges.position), asc(studyEdges.id))
          .pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, decodePersistedStudyEdge),
            ),
            Effect.map((rows) => rows.map(({ fromNode }) => fromNode)),
            failRepository("listSources"),
          ),
      ),
    )

  return StudyCatalogRepository.of({
    listNodes,
    listCountries,
    userCountsByNodeIds,
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
