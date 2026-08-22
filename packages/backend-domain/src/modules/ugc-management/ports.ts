import type { AgreementTerms, ContractSnapshot, UgcUser, UgcVideo } from "@proxus/shared/ugc-management"
import { Context, Effect, Layer, Ref } from "effect"

export class UgcIdGenerator extends Context.Service<UgcIdGenerator, {
  readonly next: () => Effect.Effect<string>
}>()("@proxus/backend-domain/modules/ugc-management/ports/UgcIdGenerator") {}

export interface ContractRenderInput {
  readonly creator: UgcUser
  readonly locale: ContractSnapshot["locale"]
  readonly documentType: ContractSnapshot["documentType"]
  readonly documentNumber: string
  readonly address: string
  readonly paymentMethod: ContractSnapshot["paymentMethod"]
  readonly terms: AgreementTerms
}

export class UgcContractRenderer extends Context.Service<UgcContractRenderer, {
  readonly render: (input: ContractRenderInput) => Effect.Effect<string>
}>()("@proxus/backend-domain/modules/ugc-management/ports/UgcContractRenderer") {}

export class UgcVideoMetricsProvider extends Context.Service<UgcVideoMetricsProvider, {
  readonly read: (video: UgcVideo) => Effect.Effect<{
    readonly tiktokViews: number
    readonly instagramViews: number
    readonly source: "mock" | "rapid-api" | "manual"
  }>
}>()("@proxus/backend-domain/modules/ugc-management/ports/UgcVideoMetricsProvider") {}

export const makeDeterministicUgcIdGenerator = (ids: ReadonlyArray<string>) => Layer.effect(
  UgcIdGenerator,
  Ref.make([...ids]).pipe(Effect.map((state) => UgcIdGenerator.of({
    next: () => Ref.modify(state, ([head, ...tail]) => [head ?? "00000000-0000-4000-8000-ffffffffffff", tail]),
  }))),
)

export const UgcContractRendererTest = Layer.succeed(UgcContractRenderer, UgcContractRenderer.of({
  render: (input) => Effect.succeed(`CONTRATO DE COLABORACIÓN UGC PROXUS\nCreador: ${input.creator.displayName}\nDocumento: ${input.documentType} ${input.documentNumber}\nDomicilio: ${input.address}\nPago: ${input.paymentMethod}`),
}))

export const UgcVideoMetricsProviderTest = Layer.succeed(UgcVideoMetricsProvider, UgcVideoMetricsProvider.of({
  read: (video) => Effect.succeed({
    tiktokViews: video.tiktokUrl === null ? 0 : 12_000,
    instagramViews: video.instagramUrl === null ? 0 : 3_000,
    source: "mock",
  }),
}))
