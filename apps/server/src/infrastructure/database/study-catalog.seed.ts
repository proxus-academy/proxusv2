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
  UniversitySubjectEdge,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyAssetId,
  makeStudyEdgeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
} from "@proxus/shared/study-catalog"
import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from "drizzle-orm/effect-pglite"
import { sql } from "drizzle-orm"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { DateTime, Effect } from "effect"
import { StudyAsset } from "../../modules/study-catalog/model.js"
import { studyAssets, studyEdges, studyNodes } from "./schema.js"

const createdAt = DateTime.makeUnsafe("2026-07-15T00:00:00.000Z")

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
  nodes: [
    new CountryNode({
      id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"),
      kind: "country",
      name: "España",
      imageAssetId: makeStudyAssetId(
        "10000000-0000-4000-8000-000000000001",
      ),
      status: "published",
      createdAt,
      updatedAt: createdAt,
    }),
    new StudyTypeNode({
      id: makeStudyTypeNodeId("20000000-0000-4000-8000-000000000002"),
      kind: "type",
      name: "Estudios universitarios",
      imageAssetId: null,
      status: "published",
      createdAt,
      updatedAt: createdAt,
    }),
    new UniversityNode({
      id: makeUniversityNodeId("20000000-0000-4000-8000-000000000003"),
      kind: "university",
      name: "Universidad Complutense de Madrid",
      imageAssetId: makeStudyAssetId(
        "10000000-0000-4000-8000-000000000002",
      ),
      status: "published",
      createdAt,
      updatedAt: createdAt,
    }),
    new DegreeNode({
      id: makeDegreeNodeId("20000000-0000-4000-8000-000000000004"),
      kind: "degree",
      name: "Ingeniería Informática",
      imageAssetId: null,
      status: "published",
      createdAt,
      updatedAt: createdAt,
    }),
    new SubjectNode({
      id: makeSubjectNodeId("20000000-0000-4000-8000-000000000005"),
      kind: "subject",
      name: "Álgebra",
      imageAssetId: null,
      status: "published",
      createdAt,
      updatedAt: createdAt,
    }),
  ],
  edges: [
    new CountryTypeEdge({
      id: makeStudyEdgeId("30000000-0000-4000-8000-000000000001"),
      from: makeCountryNodeId("20000000-0000-4000-8000-000000000001"),
      to: makeStudyTypeNodeId("20000000-0000-4000-8000-000000000002"),
      position: 0,
    }),
    new TypeUniversityEdge({
      id: makeStudyEdgeId("30000000-0000-4000-8000-000000000002"),
      from: makeStudyTypeNodeId("20000000-0000-4000-8000-000000000002"),
      to: makeUniversityNodeId("20000000-0000-4000-8000-000000000003"),
      position: 0,
    }),
    new UniversityDegreeEdge({
      id: makeStudyEdgeId("30000000-0000-4000-8000-000000000003"),
      from: makeUniversityNodeId("20000000-0000-4000-8000-000000000003"),
      to: makeDegreeNodeId("20000000-0000-4000-8000-000000000004"),
      position: 0,
    }),
    new UniversitySubjectEdge({
      id: makeStudyEdgeId("30000000-0000-4000-8000-000000000004"),
      from: makeUniversityNodeId("20000000-0000-4000-8000-000000000003"),
      to: makeSubjectNodeId("20000000-0000-4000-8000-000000000005"),
      position: 1,
    }),
    new DegreeSubjectEdge({
      id: makeStudyEdgeId("30000000-0000-4000-8000-000000000005"),
      from: makeDegreeNodeId("20000000-0000-4000-8000-000000000004"),
      to: makeSubjectNodeId("20000000-0000-4000-8000-000000000005"),
      position: 0,
    }),
  ],
} as const

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
