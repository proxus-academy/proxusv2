# Proxus v2

Monorepo en reinicio: tres apps shell sin lógica de dominio ni APIs todavía.

## Apps

| App | Puerto dev | Rol |
| --- | --- | --- |
| `apps/server` | 3001 | Servidor HTTP Effect (placeholder) |
| `apps/web` | 5173 | Web React + Vite |
| `apps/mobile-web` | 5174 | PWA / touch-first (shell independiente de `web`) |

## Referencias locales (git submodules)

Los repos de lectura viven en `.repos/` (misma convención que el monorepo anterior). Tras clonar:

```bash
git submodule update --init --recursive
```

La guía Effect del repo apunta a `.repos/effect-smol` — ver [`docs/effect/README.md`](./docs/effect/README.md).

## Comandos

```bash
pnpm install
pnpm dev              # server + web + mobile-web
pnpm dev:api          # solo server
pnpm dev:web          # solo web
pnpm dev:mobile-web   # solo mobile-web
pnpm typecheck
pnpm build
pnpm check            # typecheck + build
```

## Próximos pasos (no hechos aún)

- Contratos y `packages/shared`
- Handlers, auth, persistencia
- Proxy `/api` hacia el server cuando exista API