// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Resource } from "alchemy"
import { Unowned } from "alchemy/AdoptPolicy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { ownerLabel, ownerLabelValue } from "./owner-label.ts"

export type BigQueryField = {
  readonly name: string
  readonly type: "STRING" | "INTEGER" | "TIMESTAMP" | "RECORD"
  readonly mode: "NULLABLE" | "REQUIRED"
  readonly fields?: ReadonlyArray<BigQueryField>
}
export interface BigQueryDatasetMetadata { readonly project: string; readonly datasetId: string; readonly location: string; readonly labels: Readonly<Record<string, string>>; readonly etag?: string }
export interface BigQueryTableMetadata { readonly project: string; readonly datasetId: string; readonly tableId: string; readonly schema: ReadonlyArray<BigQueryField>; readonly labels: Readonly<Record<string, string>>; readonly etag?: string }
export class BigQueryResourceClientError extends Data.TaggedError("BigQueryResourceClientError")<{ readonly operation: string; readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "unknown" }> {}
export interface BigQueryResourceClient {
  getDataset(project: string, datasetId: string): Effect.Effect<BigQueryDatasetMetadata, BigQueryResourceClientError>
  createDataset(input: BigQueryDatasetMetadata): Effect.Effect<BigQueryDatasetMetadata, BigQueryResourceClientError>
  deleteDataset(project: string, datasetId: string): Effect.Effect<void, BigQueryResourceClientError>
  getTable(project: string, datasetId: string, tableId: string): Effect.Effect<BigQueryTableMetadata, BigQueryResourceClientError>
  createTable(input: BigQueryTableMetadata): Effect.Effect<BigQueryTableMetadata, BigQueryResourceClientError>
  deleteTable(project: string, datasetId: string, tableId: string): Effect.Effect<void, BigQueryResourceClientError>
}
interface DatasetProps { readonly project: string; readonly datasetId: string; readonly location: string; readonly labels?: Readonly<Record<string, string>>; readonly deletionProtection: true }
export type BigQueryDatasetAttributes = BigQueryDatasetMetadata
export type BigQueryDataset = Resource<"Proxus.GCP.BigQuery.Dataset", DatasetProps, BigQueryDatasetAttributes>
export const BigQueryDataset = Resource<BigQueryDataset>("Proxus.GCP.BigQuery.Dataset")
interface TableProps { readonly project: string; readonly datasetId: string; readonly tableId: string; readonly schema: ReadonlyArray<BigQueryField>; readonly labels?: Readonly<Record<string, string>>; readonly deletionProtection: true }
export type BigQueryTableAttributes = BigQueryTableMetadata
export type BigQueryTable = Resource<"Proxus.GCP.BigQuery.Table", TableProps, BigQueryTableAttributes>
export const BigQueryTable = Resource<BigQueryTable>("Proxus.GCP.BigQuery.Table")
const missing = (e: BigQueryResourceClientError) => e.code === "not-found"
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const makeBigQueryDatasetProviderService = (client: BigQueryResourceClient) => BigQueryDataset.Provider.of({
    nuke: { skip: true }, stables: ["project", "datasetId", "location"], list: () => Effect.succeed([]),
    diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed((output?.project ?? olds.project) !== news.project || (output?.datasetId ?? olds.datasetId) !== news.datasetId || (output?.location ?? olds.location) !== news.location ? { action: "replace" } as const : undefined),
    read: ({ fqn, output, olds }) => {
      const project = output?.project ?? olds?.project; const datasetId = output?.datasetId ?? olds?.datasetId
      return project === undefined || datasetId === undefined ? Effect.succeed(undefined) : client.getDataset(project, datasetId).pipe(Effect.map((v) => v.labels.proxus_alchemy_fqn === ownerLabelValue(fqn) ? v : Unowned(v)), Effect.catchIf(missing, () => Effect.succeed(undefined)))
    },
    reconcile: ({ fqn, news }) => client.createDataset({ project: news.project, datasetId: news.datasetId, location: news.location, labels: { ...(news.labels ?? {}), ...ownerLabel(fqn) } }).pipe(Effect.catchIf((e) => e.code === "conflict", () => client.getDataset(news.project, news.datasetId))),
    delete: () => Effect.void,
  })
export const makeBigQueryTableProviderService = (client: BigQueryResourceClient) => BigQueryTable.Provider.of({
    nuke: { skip: true }, stables: ["project", "datasetId", "tableId", "schema"], list: () => Effect.succeed([]),
    diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed((output?.project ?? olds.project) !== news.project || (output?.datasetId ?? olds.datasetId) !== news.datasetId || (output?.tableId ?? olds.tableId) !== news.tableId || !same(output?.schema ?? olds.schema, news.schema) ? { action: "replace" } as const : undefined),
    read: ({ fqn, output, olds }) => {
      const project = output?.project ?? olds?.project; const datasetId = output?.datasetId ?? olds?.datasetId; const tableId = output?.tableId ?? olds?.tableId
      return project === undefined || datasetId === undefined || tableId === undefined ? Effect.succeed(undefined) : client.getTable(project, datasetId, tableId).pipe(Effect.map((v) => v.labels.proxus_alchemy_fqn === ownerLabelValue(fqn) ? v : Unowned(v)), Effect.catchIf(missing, () => Effect.succeed(undefined)))
    },
    reconcile: ({ fqn, news }) => client.createTable({ project: news.project, datasetId: news.datasetId, tableId: news.tableId, schema: news.schema, labels: { ...(news.labels ?? {}), ...ownerLabel(fqn) } }).pipe(Effect.catchIf((e) => e.code === "conflict", () => client.getTable(news.project, news.datasetId, news.tableId))),
    delete: () => Effect.void,
  })
import * as Layer from "effect/Layer"
export const bigQueryResourceProviders = (client: BigQueryResourceClient) => Layer.merge(
  Provider.succeed(BigQueryDataset, makeBigQueryDatasetProviderService(client)),
  Provider.succeed(BigQueryTable, makeBigQueryTableProviderService(client)),
)
