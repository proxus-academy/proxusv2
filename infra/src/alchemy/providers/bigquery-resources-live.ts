// @effect-diagnostics anyUnknownInErrorContext:off strictEffectProvide:off strictBooleanExpressions:off
import { deleteDatasets, deleteTables, getDatasets, getTables, insertDatasets, insertTables, type Dataset, Table } from "@distilled.cloud/gcp/bigquery-v2"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import { BigQueryResourceClientError, type BigQueryDatasetMetadata, type BigQueryField, type BigQueryResourceClient, type BigQueryTableMetadata } from "./bigquery-resources.ts"

export interface DistilledBigQueryResourceOperations {
  readonly getDataset: (r: { projectId: string; datasetId: string }) => Effect.Effect<Dataset, unknown>
  readonly createDataset: (r: { projectId: string; body: Dataset }) => Effect.Effect<Dataset, unknown>
  readonly deleteDataset: (r: { projectId: string; datasetId: string; deleteContents: false }) => Effect.Effect<unknown, unknown>
  readonly getTable: (r: { projectId: string; datasetId: string; tableId: string; view: "FULL" }) => Effect.Effect<Table, unknown>
  readonly createTable: (r: { projectId: string; datasetId: string; body: Table }) => Effect.Effect<Table, unknown>
  readonly deleteTable: (r: { projectId: string; datasetId: string; tableId: string }) => Effect.Effect<unknown, unknown>
}
const liveLayer = Layer.merge(fromADC(), FetchHttpClient.layer)
const provide = <A, E>(e: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => e.pipe(Effect.provide(liveLayer))
const operations: DistilledBigQueryResourceOperations = {
  getDataset: (r) => provide(getDatasets(r)), createDataset: (r) => provide(insertDatasets(r)), deleteDataset: (r) => provide(deleteDatasets(r)),
  getTable: (r) => provide(getTables(r)), createTable: (r) => provide(insertTables(r)), deleteTable: (r) => provide(deleteTables(r)),
}
const code = (cause: unknown): BigQueryResourceClientError["code"] => {
  const tag = typeof cause === "object" && cause !== null && "_tag" in cause ? String(cause._tag) : ""
  return tag === "NotFound" ? "not-found" : tag === "Forbidden" || tag === "Unauthorized" ? "forbidden" : tag === "Conflict" ? "conflict" : tag === "BadRequest" ? "invalid" : "unknown"
}
const normalize = (operation: string) => (cause: unknown) => new BigQueryResourceClientError({ operation, code: code(cause) })
const dataset = (value: Dataset, operation: string): Effect.Effect<BigQueryDatasetMetadata, BigQueryResourceClientError> => Effect.try({ try: () => {
  const project = value.datasetReference?.projectId; const datasetId = value.datasetReference?.datasetId
  if (!project || !datasetId || !value.location) throw new Error("invalid dataset")
  return { project, datasetId, location: value.location, labels: { ...(value.labels ?? {}) }, ...(value.etag ? { etag: value.etag } : {}) }
}, catch: normalize(operation) })
const fields = (value: Table["schema"]): ReadonlyArray<BigQueryField> => (value?.fields ?? []).map((f) => ({ name: f.name ?? "", type: (f.type ?? "STRING") as BigQueryField["type"], mode: (f.mode ?? "NULLABLE") as BigQueryField["mode"], ...(f.fields ? { fields: fields({ fields: f.fields }) } : {}) }))
const table = (value: Table, operation: string): Effect.Effect<BigQueryTableMetadata, BigQueryResourceClientError> => Effect.try({ try: () => {
  const project = value.tableReference?.projectId; const datasetId = value.tableReference?.datasetId; const tableId = value.tableReference?.tableId
  if (!project || !datasetId || !tableId) throw new Error("invalid table")
  return { project, datasetId, tableId, schema: fields(value.schema), labels: { ...(value.labels ?? {}) }, ...(value.etag ? { etag: value.etag } : {}) }
}, catch: () => new BigQueryResourceClientError({ operation, code: "invalid" }) })
export const makeLiveBigQueryResourceClient = (ops: DistilledBigQueryResourceOperations = operations): BigQueryResourceClient => {
  const map = <A>(name: string, e: Effect.Effect<A, unknown>) => e.pipe(Effect.mapError(normalize(name)))
  return {
    getDataset: (projectId, datasetId) => map("get-dataset", ops.getDataset({ projectId, datasetId })).pipe(Effect.flatMap((v) => dataset(v, "get-dataset"))),
    createDataset: (v) => map("create-dataset", ops.createDataset({ projectId: v.project, body: { datasetReference: { projectId: v.project, datasetId: v.datasetId }, location: v.location, labels: { ...v.labels } } })).pipe(Effect.flatMap((x) => dataset(x, "create-dataset"))),
    deleteDataset: (projectId, datasetId) => map("delete-dataset", ops.deleteDataset({ projectId, datasetId, deleteContents: false })).pipe(Effect.asVoid),
    getTable: (projectId, datasetId, tableId) => map("get-table", ops.getTable({ projectId, datasetId, tableId, view: "FULL" })).pipe(Effect.flatMap((v) => table(v, "get-table"))),
    createTable: (v) => map("create-table", ops.createTable({ projectId: v.project, datasetId: v.datasetId, body: { tableReference: { projectId: v.project, datasetId: v.datasetId, tableId: v.tableId }, schema: { fields: v.schema }, labels: { ...v.labels } } })).pipe(Effect.flatMap((x) => table(x, "create-table"))),
    deleteTable: (projectId, datasetId, tableId) => map("delete-table", ops.deleteTable({ projectId, datasetId, tableId })).pipe(Effect.asVoid),
  }
}
