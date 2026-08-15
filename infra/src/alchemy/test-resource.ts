import type { ResourceDependency } from "./resource-dependency.ts"

export const fakeResource = (fqn: string): ResourceDependency => ({ Type: "Test.Resource", FQN: fqn } as ResourceDependency)
