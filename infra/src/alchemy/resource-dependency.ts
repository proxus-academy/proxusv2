/**
 * The stable physical identity Alchemy beta.65 uses while discovering upstream
 * nodes in Resource props. Every real `ResourceLike` satisfies this contract.
 */
export interface ResourceDependency {
  readonly Type: string
  readonly FQN: string
}
export type DependsOn = { readonly dependsOn?: ReadonlyArray<ResourceDependency> }
