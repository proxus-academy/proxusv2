import { Schema } from "effect"
import { makeDslDefinitionId, type DslDefinitionId } from "../ids.js"

/** Minimal typed reference used until the full contextual DSL graph is constructed. */
export interface DslReference<Id extends string = string> {
  readonly id: Id & DslDefinitionId
  readonly version: number
}

export const defineDslReference = <const Id extends string>(input: {
  readonly id: Id
  readonly version: number
}): DslReference<Id> => Object.freeze({
  id: makeDslDefinitionId(input.id) as Id & DslDefinitionId,
  version: Schema.decodeUnknownSync(
    Schema.Int.check(Schema.isGreaterThan(0)),
  )(input.version),
})

export const DslReference = { define: defineDslReference } as const
