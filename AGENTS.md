# Agent guide — Proxus v2

## Estado del repo

- Solo existen **shells** de `apps/server`, `apps/web` y `apps/mobile-web`.
- **No** hay APIs, dominio, repositorios ni `packages/shared` de producto todavía.
- Documentación Effect normativa: `docs/effect/*` (referencia upstream en `.repos/effect-smol` vía submodules).
- Límites DDD y módulos: `docs/architecture/domain-driven-architecture.md` (mismo layout que `docs/effect`, no un árbol paralelo).

## Convenciones previstas (al añadir código)

- `pnpm` workspaces; TypeScript estándar (sin preview nativo en root).
- Backend Effect v4: flujo obligatorio `handler → service → repository (port) → adapter` (ver `docs/effect/` y `docs/architecture/domain-driven-architecture.md`).
- Bounded context = `<module>` alineado en `packages/shared` y `apps/server/src/modules/<module>/`.
- Submodules de referencia en `.repos/`, no en `.agents/references/`.

## Validación

```bash
pnpm check
```

Cuando exista el tooling de límites en el workspace:

```bash
pnpm boundaries
pnpm verify:architecture
```