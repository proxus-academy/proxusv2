# Agent guide — Proxus v2

## Estado del repo

- `study-catalog` ya tiene schemas compartidos, service, port de repository, adapter Drizzle y API HTTP tipada con handlers reales.
- Desarrollo usa PGlite y servidor HTTP Node; producción usa PostgreSQL con comprobación previa de migraciones.
- `apps/web` y `apps/mobile-web` siguen siendo shells; `apps/admin` todavía no existe.
- Documentación Effect normativa: `docs/effect/*` (referencia upstream en `.repos/effect-smol` vía submodules).
- Límites DDD y módulos: `docs/architecture/domain-driven-architecture.md` (mismo layout que `docs/effect`, no un árbol paralelo).

## Convenciones previstas (al añadir código)

- `pnpm` workspaces; TypeScript estándar (sin preview nativo en root).
- Backend Effect v4: flujo obligatorio `handler → service → repository (port) → adapter` (ver `docs/effect/` y `docs/architecture/domain-driven-architecture.md`).
- Bounded context = `<module>` alineado en `packages/shared` y `apps/server/src/modules/<module>/`.
- Frontend React: lógica de aplicación, estado remoto, mutaciones y formularios en Effect Atom; ver `docs/effect/react-and-effect-atom.md`.
- Submodules de referencia en `.repos/`, no en `.agents/references/`.

## Validación

```bash
pnpm effect:diagnostics
pnpm --filter @proxus/shared test
pnpm --filter @proxus/server test
pnpm check
```

Cuando exista el tooling de límites en el workspace:

```bash
pnpm boundaries
pnpm verify:architecture
```