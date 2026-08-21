import { RuleTester } from "oxlint/plugins-dev";

import { noUnknownParametersRule } from "./no-unknown-parameters.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("anti-slop/no-unknown-parameters", noUnknownParametersRule, {
  valid: [
    "const isName = (value: unknown): value is string => typeof value === 'string';",
    "const enrich = (cause: unknown): Error => new Error('failed', { cause });",
    "const recover = (error: unknown): void => { void error };",
    "const inspectDefect = (defect: unknown): void => { void defect };",
    "// ANTI-SLOP-BOUNDARY: external parser input is decoded here.\nconst parse = (input: unknown): string => String(input);",
  ],
  invalid: [{
    code: "const consume = (value: unknown): void => { void value };",
    errors: [{ messageId: "unknownParameter" }],
  }],
});
