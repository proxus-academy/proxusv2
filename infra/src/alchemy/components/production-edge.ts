// @effect-diagnostics anyUnknownInErrorContext:off
import type { Output } from "alchemy/Output"
import { retain } from "alchemy/RemovalPolicy"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { GlobalAddress, GlobalForwardingRule, ManagedSslCertificate, TargetHttpsProxyResource, URLMap, type GlobalResourceLink } from "../providers/edge.ts"
import type { ProductionRuntimeOutputs } from "./production-runtime.ts"
import type { ProductionWebsiteOutputs } from "./production-website.ts"

export interface ProductionEdgeProps {
  readonly project: string
  readonly domain: string
  readonly website: Pick<ProductionWebsiteOutputs, "backendBucket">
  readonly runtime: Pick<ProductionRuntimeOutputs, "publicApiLoadBalancer">
}
interface ProductionEdgeOutputs {
  readonly address: string | Output<string>
  readonly requiredDnsARecord: { readonly name: string; readonly type: "A"; readonly address: string | Output<string> }
}
export class ProductionEdgeConfigurationError extends Data.TaggedError("ProductionEdgeConfigurationError")<{ readonly message: string }> {}

type Value = string | Output<string>
type ResourceLink<K extends string> = GlobalResourceLink<K> | Output<string>
interface Components {
  readonly address: (id: string, props: { readonly project: string; readonly name: string; readonly deletionProtection: boolean }) => Effect.Effect<{ readonly address: Value; readonly selfLink: ResourceLink<"address"> }, unknown, unknown>
  readonly certificate: (id: string, props: { readonly project: string; readonly name: string; readonly domains: readonly string[]; readonly deletionProtection: boolean }) => Effect.Effect<{ readonly selfLink: ResourceLink<"sslCertificate"> }, unknown, unknown>
  readonly urlMap: (id: string, props: { readonly project: string; readonly name: string; readonly defaultBackendBucket: ResourceLink<"backendBucket">; readonly apiBackendService: ResourceLink<"backendService">; readonly deletionProtection: boolean }) => Effect.Effect<{ readonly selfLink: ResourceLink<"urlMap"> }, unknown, unknown>
  readonly proxy: (id: string, props: { readonly project: string; readonly name: string; readonly urlMap: ResourceLink<"urlMap">; readonly certificate: ResourceLink<"sslCertificate">; readonly deletionProtection: boolean }) => Effect.Effect<{ readonly selfLink: ResourceLink<"targetHttpsProxy"> }, unknown, unknown>
  readonly forwardingRule: (id: string, props: { readonly project: string; readonly name: string; readonly address: ResourceLink<"address">; readonly target: ResourceLink<"targetHttpsProxy">; readonly deletionProtection: boolean }) => Effect.Effect<unknown, unknown, unknown>
}
const real: Components = {
  address: (id, props) => GlobalAddress(id, props).pipe(retain()),
  certificate: (id, props) => ManagedSslCertificate(id, props).pipe(retain()),
  urlMap: (id, props) => URLMap(id, props as never).pipe(retain()),
  proxy: (id, props) => TargetHttpsProxyResource(id, props as never).pipe(retain()),
  forwardingRule: (id, props) => GlobalForwardingRule(id, props as never).pipe(retain()),
}
const fail = (message: string): never => { throw new ProductionEdgeConfigurationError({ message }) }

/** Composes the protected global HTTPS edge. URLMap owns the exact /api prefix rewrite contract. */
export const composeProductionEdge = (props: ProductionEdgeProps, components: Components) => {
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(props.domain)) fail("domain must be a valid lowercase DNS name")
  const api = props.runtime.publicApiLoadBalancer
  if (api === undefined) fail("production runtime services must be deployed before creating the edge")
  const backendBucket = props.website.backendBucket.selfLink as ResourceLink<"backendBucket">
  const apiBackend = api!.backendService as ResourceLink<"backendService">
  return Effect.gen(function* () {
    const address = yield* components.address("ProductionEdge-Address", { project: props.project, name: "proxus-production", deletionProtection: true })
    const certificate = yield* components.certificate("ProductionEdge-Certificate", { project: props.project, name: "proxus-production", domains: [props.domain], deletionProtection: true })
    const urlMap = yield* components.urlMap("ProductionEdge-UrlMap", { project: props.project, name: "proxus-production", defaultBackendBucket: backendBucket, apiBackendService: apiBackend, deletionProtection: true })
    const proxy = yield* components.proxy("ProductionEdge-HttpsProxy", { project: props.project, name: "proxus-production", urlMap: urlMap.selfLink, certificate: certificate.selfLink, deletionProtection: true })
    yield* components.forwardingRule("ProductionEdge-HttpsForwardingRule", { project: props.project, name: "proxus-production-https", address: address.selfLink, target: proxy.selfLink, deletionProtection: true })
    return { address: address.address, requiredDnsARecord: { name: props.domain, type: "A", address: address.address } } satisfies ProductionEdgeOutputs
  })
}
export const ProductionEdge = (props: ProductionEdgeProps) => composeProductionEdge(props, real)
