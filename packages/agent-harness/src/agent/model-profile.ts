import { makeModelProfileId, type ModelProfileId } from "../ids.js"

/** A stable application-owned key resolved to Effect AI models at a composition root. */
export interface ModelProfile<Id extends string = string> {
  readonly id: Id & ModelProfileId
}

export const defineModelProfile = <const Id extends string>(input: {
  readonly id: Id
}): ModelProfile<Id> => Object.freeze({
  id: makeModelProfileId(input.id) as Id & ModelProfileId,
})

export const ModelProfile = { define: defineModelProfile } as const
