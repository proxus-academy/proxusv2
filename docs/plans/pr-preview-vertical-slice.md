# PR preview vertical slice

> Status: minimal local runtime artifact implemented and verified; disposable GCP deployment pending.

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

The preview runtime uses real PostgreSQL repositories, applies migrations before becoming healthy, and installs deterministic synthetic catalog/auth fixtures. It deliberately uses fake Google identity, console email and in-memory analytics; no production data or provider credentials are used.

The multi-stage image bundles the API into a standalone Node ESM artifact. Its final stage contains only that bundle, the gateway/entrypoint, Drizzle migrations and compiled frontend assets. Build-time checks reject PGlite, `tsx` and TypeScript runtime content. The final image runs as the unprivileged Node user.

## Local proof

```bash
pnpm preview:up
pnpm preview:smoke
pnpm preview:down
```

Local Compose uses PostgreSQL 17.7. The smoke command waits for migration/seed completion and verifies Web, Admin, Public OpenAPI and Admin OpenAPI through the same gateway URL.

## GCP spike

The first cloud deployment is named `preview-spike`; it is not attached to a PR lifecycle.

Existing protected foundation:

- project `proxus-v2`;
- region `europe-southwest1`;
- Artifact Registry repository `proxus`;
- shared `db-f1-micro` Cloud SQL PostgreSQL 17 instance.

Disposable resources:

- database `proxus_preview_spike`;
- least-privilege runtime identity/user;
- one Artifact Registry image tagged with an immutable Git SHA;
- one Cloud Run service with min instances 0 and max instances 1.

Sequence:

1. Build and smoke the exact image locally.
2. Create the dedicated database and grants without changing the shared instance lifecycle.
3. Push the image.
4. Deploy Cloud Run with the Cloud SQL attachment and secrets supplied by Secret Manager.
5. Run the same smoke command against the Cloud Run URL.
6. Record timings, connection use and failures.
7. Destroy the Cloud Run service, database and preview-owned identities.

## Gates before PR automation

- The cloud smoke passes from a clean database.
- Destruction is idempotent and cannot target the shared instance.
- The image does not contain PGlite or production secrets.
- The service is access-controlled before previews contain reviewable product data.
- Build/deploy credentials come from Workload Identity Federation, never JSON keys.
- A reconciliation command can identify resources by PR/owner labels.

Only after these gates pass will a trusted workflow implement label-driven deploy/update/destroy and PR comments.
