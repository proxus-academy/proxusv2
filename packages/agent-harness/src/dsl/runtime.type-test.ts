import { Effect, Schema } from "effect"
import { Dsl } from "./definition.js"
import { DslRuntime } from "./runtime.js"

const definition = Dsl.define({
  id: "handler-types",
  version: 1,
  roots: { typed: "typed" },
  contexts: {
    typed: { methods: {
      read: Dsl.operation(Schema.Struct({ id: Schema.Number }), Schema.String, { id: "typed.read" }),
      count: Dsl.operation(Schema.Undefined, Schema.Number, { id: "typed.count" }),
    } },
  },
})

DslRuntime.handlersLayer(definition)({
  "typed.read": (input) => Effect.succeed(String(input.id)),
  "typed.count": () => Effect.succeed(1),
})

// @ts-expect-error every declared operation requires a handler
DslRuntime.handlersLayer(definition)({
  "typed.read": () => Effect.succeed("ok"),
})

DslRuntime.handlersLayer(definition)({
  // @ts-expect-error handler result must match the operation output schema
  "typed.read": () => Effect.succeed(123),
  "typed.count": () => Effect.succeed(1),
})

DslRuntime.handlersLayer(definition)({
  // @ts-expect-error handler input is inferred from the operation input schema
  "typed.read": (input: { readonly id: string }) => Effect.succeed(input.id),
  "typed.count": () => Effect.succeed(1),
})
