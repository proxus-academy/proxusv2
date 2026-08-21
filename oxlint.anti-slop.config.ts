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
    // Exact optional properties require omission rather than explicit undefined.
    "anti-slop/no-conditional-empty-object-spread": "off",
    "anti-slop/no-erased-react-state": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    // Audit separately: this rule also rejects legitimate browser and library type guards.
    "anti-slop/no-runtime-typeof": "off",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    // Audit separately: upstream currently classifies non-service make* factories as constructors.
    "anti-slop-effect/no-service-constructor-imports": "off",
  },
})
