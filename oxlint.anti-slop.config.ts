import { defineConfig } from "oxlint"

export default defineConfig({
  categories: {
    correctness: "off",
  },
  jsPlugins: [
    {
      name: "anti-slop",
      specifier: "./tools/oxlint/anti-slop/index.ts",
    },
    {
      name: "anti-slop-effect",
      specifier: "./tools/oxlint/anti-slop/effect/index.ts",
    },
  ],
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    // Proxus uses exact optional properties; conditional spreads preserve absence rather than encoding it as undefined.
    "anti-slop/no-conditional-empty-object-spread": "off",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    // Runtime guards are intentional at browser, HTTP, persistence, and other untyped I/O boundaries.
    "anti-slop/no-runtime-typeof": "off",
    "anti-slop/no-shape-in-symbol-names": "error",
    // Boundary adapters accept/return unknown until the owning Effect Schema validates the representation.
    "anti-slop/no-unknown-parameters": "off",
    "anti-slop/no-unknown-returns": "off",
    "anti-slop/no-unknown-type-aliases": "error",
    // Unknown-valued dictionaries represent external JSON and reflection boundaries before parsing.
    "anti-slop/no-unsafe-dictionary-type": "off",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    // Proxus composition roots import constructors to assemble concrete Layers by design.
    "anti-slop-effect/no-service-constructor-imports": "off",
  },
})
