# PR preview vertical slice

> Status: local artifact and Cloud Run spike verified; label-driven PR lifecycle implemented.

## Goal

Prove one complete, disposable preview before automating PR lifecycle or selecting an IaC writer. The preview packages the two compiled frontends and both HTTP surfaces in one Cloud Run image, backed by a dedicated database on the existing shared Cloud SQL PostgreSQL 17 instance.

This packaging is preview-only. Production retains separately deployable public/admin APIs and CDN-hosted frontends.

## Affected layers

```text
- shared contract/API: no
- persistence and repositories: yes, existing PostgreSQL adapters
- services/use cases: no product behavior changes
- HTTP handlers: no; preview composes the existing public/admin routes
- frontend core/atoms: no
- web frontend adapters: no; existing /api and /admin-api bases are reused
- UI/screens/routes: no
- tests and fixtures: yes, deterministic preview seed and smoke checks
- documentation: yes
```

## Runtime shape

```text
Cloud Run :8080
└── preview gateway
    ├── /api/*       → combined Effect HTTP runtime, public routes
    ├── /admin-api/* → combined Effect HTTP runtime, admin routes
    ├── /admin/*     → compiled Admin SPA
    ├── /ui/*        → compiled Storybook
    └── /*           → compiled Web SPA
             │
             └── dedicated preview database in shared Cloud SQL
```

A single Effect HTTP runtime serves both API surfaces and the compiled frontends. Public and administrative routes are mounted under `/api` and `/admin-api`; Effect's static server serves the Web and Admin SPAs under `/` and `/admin`, plus the compiled Storybook under `/ui`. Cloud Run receives traffic on port 8080, and `NodeRuntime` owns interruption and graceful server shutdown. There is no internal proxy, second listener or child-process supervisor.

The preview runtime uses real PostgreSQL repositories. Startup only checks the Drizzle ledger and fails when migrations are pending; it never changes the schema. A one-shot Cloud Run Job applies migrations and installs deterministic synthetic catalog/auth fixtures when the preview database is first created. It deliberately uses fake Google identity, console email and in-memory analytics; no production data or provider credentials are used.

The multi-stage image bundles the complete preview HTTP runtime into a standalone Node ESM artifact. Its final stage contains only that bundle, the database initializer, Drizzle migrations and compiled frontend assets. Build-time checks reject PGlite, `tsx` and TypeScript runtime content. The final image runs as the unprivileged Node user.

## Local proof

```bash
pnpm preview:up
pnpm preview:smoke
pnpm preview:down
```

Local Compose uses PostgreSQL 17.7. The smoke command waits for migration/seed completion and verifies Web, Admin, Storybook, Public OpenAPI and Admin OpenAPI through the same preview URL.

## GCP spike

The cloud spike is `proxus-preview-spike`. Cloud Build is connected to `proxus-academy/proxusv2` and watches `feat/pr-preview-environments`. It builds in Google Cloud, pushes to Artifact Registry, deploys Cloud Run and performs a remote smoke on every commit.

Protected shared foundation:

- project `proxus-v2` and region `europe-southwest1`;
- Artifact Registry repository `proxus` with immutable tags;
- shared `db-f1-micro` Cloud SQL PostgreSQL 17 instance `proxus-previews`;
- runtime, Cloud Build and lifecycle service accounts;
- GitHub Workload Identity Federation, with no JSON keys.

Each PR owns resources named from its number:

- Cloud Build trigger and Cloud Run service `proxus-pr-<number>`;
- database/user `proxus_preview_<number>`;
- database URL secret `proxus-pr-<number>-database-url`;
- initialization Job `proxus-pr-<number>-initialize`.

The trusted `pull_request_target` workflow checks out lifecycle code from `main`. Opening or reopening an internal PR creates the database and secret, creates a trigger with an inline trusted build configuration, forces the first build, initializes the database from that exact image, deploys and comments the URL. The stored trigger is then replaced with an update-only variant. New commits build and deploy automatically without migrations or seeds. Closing the PR deletes all PR-owned resources.

The inline Cloud Build configuration is captured when the trigger is created; it is not read from the observed PR branch. Release image tags include both commit and build IDs in the immutable `proxus` repository. A separate mutable `proxus-preview-cache` Artifact Registry repository carries BuildKit inline cache metadata without weakening release-image immutability. The preview image fetches dependencies before copying application sources and compiles Web, Admin and Storybook concurrently on an eight-vCPU Cloud Build worker. Cloud Build pulls its deployment-tool image in parallel with the application build.

Every preview is initially deployed without anonymous access. On that first deployment, Cloud Build receives a temporary resource-level Cloud Run invoker binding, waits for one readiness route, verifies the remaining SPA, Storybook and API surfaces concurrently with an identity token, and then removes that binding. The build enables IAP directly on the service, grants `roles/iap.httpsResourceAccessor` only to the Google Group configured by the trusted `PREVIEW_IAP_GROUP` environment variable, grants the IAP service agent Cloud Run invocation, and verifies that anonymous navigation redirects to IAP. Subsequent commits preserve IAP and its policies instead of toggling them: Cloud Run waits for the new revision to become ready and the build verifies the existing IAP redirect. The final service has no direct user or build-service-account invoker binding.

A measured update on the eight-vCPU worker took 75 seconds while seeding the dedicated cache and 47 seconds with a warm cache, compared with 4 minutes 53 seconds before these changes. The warm run spent 9 seconds building the image, 10 seconds deploying the revision and 28 seconds pulling the Cloud SDK image in parallel with the build; that tool-image pull is now the dominant floor.

## Operations and safety

```bash
PREVIEW_IAP_GROUP=preview-reviewers@example.com \
  node scripts/preview-lifecycle.mjs create 123 feature/my-branch
node scripts/preview-lifecycle.mjs destroy 123
```

The GitHub `preview` environment must define `PREVIEW_IAP_GROUP` as an environment variable containing a Google Group email address. IAP must be bootstrapped once for the project with an OAuth client appropriate for the organization's users; the lifecycle then manages each service's group binding.

Only numeric PR identifiers are accepted, and deletion derives every resource name from that identifier. Destroy is idempotent and cannot target the shared SQL instance. The image contains neither PGlite nor production secrets. Build/deploy credentials use Workload Identity Federation and dedicated service accounts.

If a commit adds a migration, Cloud Run startup rejects the new revision and Cloud Build fails while the previous ready revision remains available. Applying migrations is deliberately an explicit operation; it is not part of commit-triggered updates.

Retention cleanup for old Artifact Registry images and periodic orphan reconciliation remain operational follow-ups; PR close/unlabel cleanup is the primary lifecycle.
