import {
  CountryNode,
  CountryTypeEdge,
  DegreeNode,
  DegreeSubjectEdge,
  StudyTypeNode,
  SubjectNode,
  TypeUniversityEdge,
  UniversityDegreeEdge,
  UniversityNode,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyAssetId,
  makeStudyEdgeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
  type StudyEdge,
  type StudyNode,
} from "@proxus/shared/study-catalog"
import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from "drizzle-orm/effect-pglite"
import { inArray, sql } from "drizzle-orm"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { DateTime, Effect } from "effect"
import { StudyAsset } from "@proxus/backend-domain/study-catalog"
import { studyAssets, studyEdges, studyNodes } from "./schema/study-catalog.js"

const createdAt = DateTime.makeUnsafe("2026-07-15T00:00:00.000Z")
const nodeUuid = (sequence: number) =>
  `20000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`
const edgeUuid = (sequence: number) =>
  `30000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`

const catalogBranches = [
  {
    countryName: "España",
    universityName: "Universidad Complutense de Madrid",
    degreeName: "Ingeniería Informática",
    subjectName: "Programación",
  },
  {
    countryName: "Argentina",
    universityName: "Universidad de Buenos Aires",
    degreeName: "Medicina",
    subjectName: "Anatomía",
  },
  {
    countryName: "Colombia",
    universityName: "Universidad Nacional de Colombia",
    degreeName: "Derecho",
    subjectName: "Derecho constitucional colombiano",
  },
  {
    countryName: "México",
    universityName: "Universidad Nacional Autónoma de México",
    degreeName: "Psicología",
    subjectName: "Psicología social",
  },
].map((definition, index) => ({
  country: new CountryNode({
    id: makeCountryNodeId(nodeUuid(index + 1)),
    kind: "country",
    name: definition.countryName,
    imageAssetId:
      index === 0
        ? makeStudyAssetId("10000000-0000-4000-8000-000000000001")
        : null,
    status: "published",
    createdAt,
    updatedAt: createdAt,
  }),
  bachillerato: new StudyTypeNode({
    id: makeStudyTypeNodeId(nodeUuid(5 + index * 2)),
    kind: "type",
    name: "Bachillerato",
    imageAssetId: null,
    status: "published",
    createdAt,
    updatedAt: createdAt,
  }),
  universityType: new StudyTypeNode({
    id: makeStudyTypeNodeId(nodeUuid(6 + index * 2)),
    kind: "type",
    name: "Universidad",
    imageAssetId: null,
    status: "published",
    createdAt,
    updatedAt: createdAt,
  }),
  university: new UniversityNode({
    id: makeUniversityNodeId(nodeUuid(index + 13)),
    kind: "university",
    name: definition.universityName,
    imageAssetId:
      index === 0
        ? makeStudyAssetId("10000000-0000-4000-8000-000000000002")
        : null,
    status: "published",
    createdAt,
    updatedAt: createdAt,
  }),
  degree: new DegreeNode({
    id: makeDegreeNodeId(nodeUuid(index + 17)),
    kind: "degree",
    name: definition.degreeName,
    imageAssetId: null,
    status: "published",
    createdAt,
    updatedAt: createdAt,
  }),
  subject: new SubjectNode({
    id: makeSubjectNodeId(nodeUuid(index + 21)),
    kind: "subject",
    name: definition.subjectName,
    imageAssetId: null,
    status: "published",
    createdAt,
    updatedAt: createdAt,
  }),
}))

const countries = catalogBranches.map(({ country }) => country)
const studyTypes = catalogBranches.flatMap(
  ({ bachillerato, universityType }) => [bachillerato, universityType],
)
const universities = catalogBranches.map(({ university }) => university)
const degrees = catalogBranches.map(({ degree }) => degree)
const subjects = catalogBranches.map(({ subject }) => subject)

let edgeSequence = 1
const nextEdgeId = () => makeStudyEdgeId(edgeUuid(edgeSequence++))
const obsoleteFixtureEdgeIds = Array.from({ length: 44 }, (_, index) =>
  makeStudyEdgeId(edgeUuid(index + 21)),
)

const edges: Array<StudyEdge> = [
  ...catalogBranches.flatMap(({ country, bachillerato, universityType }) => [
    new CountryTypeEdge({
      id: nextEdgeId(),
      from: country.id,
      to: bachillerato.id,
      position: 0,
    }),
    new CountryTypeEdge({
      id: nextEdgeId(),
      from: country.id,
      to: universityType.id,
      position: 1,
    }),
  ]),
  ...catalogBranches.map(({ universityType, university }) =>
    new TypeUniversityEdge({
      id: nextEdgeId(),
      from: universityType.id,
      to: university.id,
      position: 0,
    }),
  ),
  ...catalogBranches.map(({ university, degree }) =>
    new UniversityDegreeEdge({
      id: nextEdgeId(),
      from: university.id,
      to: degree.id,
      position: 0,
    }),
  ),
  ...catalogBranches.map(({ degree, subject }) =>
    new DegreeSubjectEdge({
      id: nextEdgeId(),
      from: degree.id,
      to: subject.id,
      position: 0,
    }),
  ),
]

export const studyCatalogSeed = {
  assets: [
    new StudyAsset({
      id: makeStudyAssetId("10000000-0000-4000-8000-000000000001"),
      storageKey: "study-catalog/countries/spain.webp",
      contentType: "image/webp",
      createdAt,
    }),
    new StudyAsset({
      id: makeStudyAssetId("10000000-0000-4000-8000-000000000002"),
      storageKey: "study-catalog/universities/complutense.webp",
      contentType: "image/webp",
      createdAt,
    }),
  ],
  nodes: [...countries, ...studyTypes, ...universities, ...degrees, ...subjects],
  edges,
} satisfies {
  readonly assets: ReadonlyArray<StudyAsset>
  readonly nodes: ReadonlyArray<StudyNode>
  readonly edges: ReadonlyArray<StudyEdge>
}

type SeedDatabase = PgEffectDatabase<
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT
>

export const seedStudyCatalog = (db: SeedDatabase) =>
  db.transaction((tx) =>
    Effect.gen(function*() {
      yield* tx
        .insert(studyAssets)
        .values(
          studyCatalogSeed.assets.map((asset) => ({
            id: asset.id,
            storageKey: asset.storageKey,
            contentType: asset.contentType,
            createdAt: DateTime.toDateUtc(asset.createdAt),
          })),
        )
        .onConflictDoUpdate({
          target: studyAssets.id,
          set: {
            storageKey: sql`excluded.storage_key`,
            contentType: sql`excluded.content_type`,
            createdAt: sql`excluded.created_at`,
          },
        })

      yield* tx
        .insert(studyNodes)
        .values(
          studyCatalogSeed.nodes.map((node) => ({
            id: node.id,
            kind: node.kind,
            name: node.name,
            imageAssetId: node.imageAssetId,
            status: node.status,
            createdAt: DateTime.toDateUtc(node.createdAt),
            updatedAt: DateTime.toDateUtc(node.updatedAt),
          })),
        )
        .onConflictDoUpdate({
          target: studyNodes.id,
          set: {
            kind: sql`excluded.kind`,
            name: sql`excluded.name`,
            imageAssetId: sql`excluded.image_asset_id`,
            status: sql`excluded.status`,
            createdAt: sql`excluded.created_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        })

      yield* tx
        .delete(studyEdges)
        .where(inArray(studyEdges.id, obsoleteFixtureEdgeIds))

      yield* tx
        .insert(studyEdges)
        .values(
          studyCatalogSeed.edges.map((edge) => ({
            id: edge.id,
            kind: edge._tag,
            fromNodeId: edge.from,
            toNodeId: edge.to,
            position: edge.position,
          })),
        )
        .onConflictDoUpdate({
          target: studyEdges.id,
          set: {
            kind: sql`excluded.kind`,
            fromNodeId: sql`excluded.from_node_id`,
            toNodeId: sql`excluded.to_node_id`,
            position: sql`excluded.position`,
          },
        })
    }),
  )
