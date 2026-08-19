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
    └── /*           → compiled Web SPA
             │
             └── dedicated preview database in shared Cloud SQL
```

The gateway and API runtime are separate processes inside the same preview-only container. The entrypoint propagates termination and terminates the container if either child exits. Cloud Run receives traffic only on port 8080. The API listens on loopback and is not exposed independently.

The preview runtime uses real PostgreSQL repositories. Startup only checks the Drizzle ledger and fails when migrations are pending; it never changes the schema. A one-shot Cloud Run Job applies migrations and installs deterministic synthetic catalog/auth fixtures when the preview database is first created. It deliberately uses fake Google identity, console email and in-memory analytics; no production data or provider credentials are used.

The multi-stage image bundles the API into a standalone Node ESM artifact. Its final stage contains only that bundle, the gateway/entrypoint, Drizzle migrations and compiled frontend assets. Build-time checks reject PGlite, `tsx` and TypeScript runtime content. The final image runs as the unprivileged Node user.

## Local proof

```bash
pnpm preview:up
pnpm preview:smoke
pnpm preview:down
```

Local Compose uses PostgreSQL 17.7. The smoke command waits for migration/seed completion and verifies Web, Admin, Public OpenAPI and Admin OpenAPI through the same gateway URL.

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

The trusted `pull_request_target` workflow checks out lifecycle code from `main`. Adding `deploy-preview` to an internal PR creates the database and secret, creates a trigger with an inline trusted build configuration, forces the first build, initializes the database from that exact image, deploys and comments the URL. The stored trigger is then replaced with an update-only variant. New commits build and deploy automatically without migrations or seeds. Removing the label or closing the PR deletes all PR-owned resources.

The inline Cloud Build configuration is captured when the trigger is created; it is not read from the observed PR branch. Image tags include both commit and build IDs because Artifact Registry enforces immutable tags. Previews are public for low-friction QA and contain synthetic data only.

## Operations and safety

```bash
node scripts/preview-lifecycle.mjs create 123 feature/my-branch
node scripts/preview-lifecycle.mjs destroy 123
```

Only numeric PR identifiers are accepted, and deletion derives every resource name from that identifier. Destroy is idempotent and cannot target the shared SQL instance. The image contains neither PGlite nor production secrets. Build/deploy credentials use Workload Identity Federation and dedicated service accounts.

If a commit adds a migration, Cloud Run startup rejects the new revision and Cloud Build fails while the previous ready revision remains available. Applying migrations is deliberately an explicit operation; it is not part of commit-triggered updates.

The public-access decision must be revisited before previews contain non-synthetic or sensitive review data. Retention cleanup for old Artifact Registry images and periodic orphan reconciliation remain operational follow-ups; PR close/unlabel cleanup is the primary lifecycle.
