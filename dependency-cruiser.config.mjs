const errorRule = (name, comment, from, to) => ({
  name,
  comment,
  severity: "error",
  from,
  to
})

const externalDependencyTypes = [
  "core",
  "npm",
  "npm-bundled",
  "npm-dev",
  "npm-no-pkg",
  "npm-optional",
  "npm-peer",
  "npm-unknown",
  "unknown"
]
const effectExternalAllowlist = [
  "(^|/)node_modules/effect(/|$)",
  "(^|/)node_modules/[.]pnpm/effect@[^/]+/node_modules/effect(/|$)"
]
const testExternalAllowlist = [
  "(^|/)node_modules/(effect|vitest)(/|$)",
  "(^|/)node_modules/[.]pnpm/(effect|vitest)@[^/]+/node_modules/(effect|vitest)(/|$)"
]
const testFile = "[.](test|spec)[.](js|jsx|mjs|mts|cjs|cts|ts|tsx)$"

export default {
  forbidden: [
    errorRule(
      "shared-is-runtime-neutral",
      "Shared contracts cannot depend on another first-party layer.",
      { path: "^packages/shared/src" },
      { path: "^(apps|packages/(?!shared(?:/|$)))" }
    ),
    errorRule(
      "shared-external-dependencies-allowlist",
      "Shared may use only its normative external allowlist: Effect at runtime and Vitest in tests.",
      { path: "^packages/shared/src", pathNot: testFile },
      { dependencyTypes: externalDependencyTypes, pathNot: effectExternalAllowlist }
    ),
    errorRule(
      "shared-test-external-dependencies-allowlist",
      "Shared tests may use only Effect and Vitest.",
      { path: `^packages/shared/src/.*${testFile}` },
      { dependencyTypes: externalDependencyTypes, pathNot: testExternalAllowlist }
    ),
    errorRule(
      "domain-does-not-depend-on-adapters",
      "Domain may depend on shared contracts, never adapters, transports, apps, or frontend code.",
      { path: "^packages/backend-domain/src" },
      { path: "^(apps|packages/(backend-(infra|transport|admin-transport)|frontend-(core|web)|product-messages|ui)(?:/|$))" }
    ),
    errorRule(
      "domain-external-dependencies-allowlist",
      "Domain may use only its normative external allowlist: Effect at runtime and Vitest in tests.",
      { path: "^packages/backend-domain/src", pathNot: testFile },
      { dependencyTypes: externalDependencyTypes, pathNot: effectExternalAllowlist }
    ),
    errorRule(
      "domain-test-external-dependencies-allowlist",
      "Domain tests may use only Effect and Vitest.",
      { path: `^packages/backend-domain/src/.*${testFile}` },
      { dependencyTypes: externalDependencyTypes, pathNot: testExternalAllowlist }
    ),
    errorRule(
      "infra-does-not-depend-on-transport",
      "Infrastructure implements domain ports and cannot depend on transports or composition roots.",
      { path: "^packages/backend-infra/src" },
      { path: "^(apps|packages/(backend-(transport|admin-transport)|frontend-(core|web)|product-messages|ui)(?:/|$))" }
    ),
    errorRule(
      "transport-does-not-depend-on-infra",
      "HTTP transports adapt domain services and cannot reach concrete infrastructure.",
      { path: "^packages/backend-(?:admin-)?transport/src" },
      { path: "^(apps|packages/backend-infra(?:/|$))" }
    ),
    errorRule(
      "public-transport-is-not-admin",
      "The public transport cannot import the admin transport or an admin/combined shared API root.",
      { path: "^packages/backend-transport/src" },
      { path: "^(packages/backend-admin-transport|packages/shared/src/(?:admin-api|api)\\.ts)" }
    ),
    errorRule(
      "admin-transport-is-not-public",
      "The admin transport cannot import the public transport or a public/combined shared API root.",
      { path: "^packages/backend-admin-transport/src" },
      { path: "^(packages/backend-transport|packages/shared/src/(?:public-api|api)\\.ts)" }
    ),
    errorRule(
      "public-shared-api-is-not-admin",
      "The public shared API root cannot import the admin shared API root.",
      { path: "^packages/shared/src/public-api\\.ts$" },
      { path: "^packages/shared/src/admin-api\\.ts$" }
    ),
    errorRule(
      "admin-shared-api-is-not-public",
      "The admin shared API root cannot import the public shared API root.",
      { path: "^packages/shared/src/admin-api\\.ts$" },
      { path: "^packages/shared/src/public-api\\.ts$" }
    ),
    errorRule(
      "public-server-is-not-admin",
      "The public composition root cannot import the admin API or admin transport.",
      { path: "^apps/server/src" },
      { path: "^(apps/admin-server|packages/backend-admin-transport|packages/shared/src/(?:admin-api|api)\\.ts)" }
    ),
    errorRule(
      "admin-server-is-not-public",
      "The admin composition root cannot import the public API or public transport.",
      { path: "^apps/admin-server/src" },
      { path: "^(apps/server|packages/backend-transport|packages/shared/src/(?:public-api|api)\\.ts)" }
    ),
    errorRule(
      "frontend-does-not-depend-on-backend",
      "Frontend layers and clients cannot import backend implementation packages.",
      { path: "^(apps/(admin|storybook|web)(?:/|$)|packages/(frontend-core|product-messages|ui)(?:/|$))" },
      { path: "^(apps/(admin-server|server)(?:/|$)|packages/backend-)" }
    ),
    errorRule(
      "backend-does-not-depend-on-frontend",
      "Backend layers and servers cannot import frontend implementation packages.",
      { path: "^(apps/(admin-server|server)(?:/|$)|packages/backend-)" },
      { path: "^(apps/(admin|storybook|web)(?:/|$)|packages/(frontend-core|product-messages|ui)(?:/|$))" }
    ),
    errorRule(
      "frontend-core-is-platform-neutral",
      "Frontend core owns neutral atoms and ports, not web adapters or visual components.",
      { path: "^packages/frontend-core/src" },
      { path: "^(apps|packages/ui(?:/|$))" }
    ),
    errorRule(
      "ui-has-no-product-logic",
      "Generic UI primitives cannot import contracts, feature logic, adapters, or apps.",
      { path: "^packages/ui/src" },
      { path: "^(apps|packages/(backend-|frontend-|product-messages|shared))" }
    )
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(?:coverage|dist|storybook-static)(?:/|$)",
    preserveSymlinks: false,
    tsPreCompilationDeps: true,
    // Workspace exports point at TypeScript source; resolving them makes package-level rules effective.
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "default"],
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"]
    }
  }
}
