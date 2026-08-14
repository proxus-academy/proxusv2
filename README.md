# Proxus v2

Monorepo pnpm con backend Effect, aplicaciones React/Vite, contratos compartidos y PGlite embebido para desarrollo.

## Requisitos

### Opción recomendada: Nix

- Nix con flakes habilitados.
- Git.
- Opcionalmente, direnv con nix-direnv para activar el entorno al entrar al repositorio.

En Linux puede instalarse Nix en modo multi-user con el instalador oficial:

```bash
curl --proto '=https' --tlsv1.2 -fsSL https://nixos.org/nix/install \
  | sh -s -- --daemon --yes
```

Habilita los comandos modernos y flakes, y después abre una terminal nueva:

```bash
printf '\nexperimental-features = nix-command flakes\n' \
  | sudo tee -a /etc/nix/nix.conf
```

En Debian/Ubuntu, la integración opcional con direnv puede prepararse así:

```bash
sudo apt-get install direnv
nix profile add nixpkgs#nix-direnv
mkdir -p ~/.config/direnv
printf '%s\n' 'source $HOME/.nix-profile/share/nix-direnv/direnvrc' \
  > ~/.config/direnv/direnvrc
```

Añade también el hook de direnv correspondiente a tu shell siguiendo su documentación. Por ejemplo, para Bash:

```bash
eval "$(direnv hook bash)"
```

El flake proporciona Node 22, Corepack, Bun y Git. Corepack selecciona `pnpm@10.32.1` a partir del campo `packageManager` del `package.json`; su primera ejecución puede necesitar conexión. `flake.lock` fija la revisión de nixpkgs y debe mantenerse versionado junto con `flake.nix`.

Después de clonar:

```bash
git submodule update --init --recursive
direnv allow
pnpm install --frozen-lockfile
```

Sin direnv:

```bash
nix develop
pnpm install --frozen-lockfile
```

Para comprobar la configuración Nix:

```bash
nix flake check
```

### Sin Nix

Instala Node 22, Corepack y Git. Bun 1.3 o posterior solo es necesario para usar Motel.

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install --frozen-lockfile
git submodule update --init --recursive
```

## Servicios y puertos

| Servicio | URL | Comando |
| --- | --- | --- |
| API pública Effect | http://localhost:3000 | `pnpm dev:server` |
| API administrativa Effect | http://localhost:3001 | `pnpm dev:admin-server` |
| Web | http://localhost:5173 | `pnpm dev:web-front` |
| Admin | http://localhost:5175 | `pnpm dev:admin-front` |
| Storybook | http://localhost:6006 | `pnpm dev:storybook` |
| Motel | http://127.0.0.1:27686 | `pnpm dev:motel` |

Los frontends redirigen `/api` al servidor público en `localhost:3000`. Admin redirige además `/admin-api` al servidor administrativo en `localhost:3001`; sus lecturas públicas no se duplican bajo `/admin`.

## Primer arranque

Prepara la base de datos local y arranca las aplicaciones:

```bash
pnpm --filter @proxus/backend-infra db:seed:pglite
pnpm dev
```

`pnpm dev` inicia ambas APIs, web y admin. También hay composiciones más pequeñas:

| Composición | Comando |
| --- | --- |
| APIs pública y administrativa + admin | `pnpm dev:admin` |
| API pública + web | `pnpm dev:web` |
| Todo | `pnpm dev` |

Storybook y Motel son opcionales y se inician por separado.

## PGlite

PGlite es una dependencia JavaScript/Wasm administrada por pnpm, no un servicio instalado por Nix. Los comandos de Infra usan por defecto `packages/backend-infra/.data`. Cada ejecutable resuelve su propio `.data` desde su directorio de trabajo, por lo que dos procesos PGlite no comparten catálogo. Para desarrollo simultáneo público/admin con datos compartidos, usa PostgreSQL local; no apuntes dos procesos al mismo directorio PGlite.

El servidor aplica migraciones al arrancar, pero no carga el seed automáticamente.

```bash
pnpm --filter @proxus/backend-infra db:migrate:pglite
pnpm --filter @proxus/backend-infra db:seed:pglite
pnpm --filter @proxus/backend-infra db:reset:pglite
```

`db:seed:pglite` migra y carga el catálogo de manera idempotente. Las cinco cuentas de autenticación/RBAC para QA se gestionan aparte y solo en development/test:

```bash
pnpm auth:qa:seed
pnpm auth:qa:list
```

El seed es idempotente y el listado omite passwords, hashes, códigos y tokens. Incluye `admin`, `catalog-editor`, `student-email`, `student-google` y `pending-email`. Con PGlite pertenece al directorio de Infra y no permite comprobar dos servidores contra identidad compartida; para ese smoke usa PostgreSQL.

> **Atención:** `db:reset:pglite` elimina los schemas locales, vuelve a migrar y carga el seed. Es destructivo.

Las ubicaciones pueden personalizarse:

```bash
PGLITE_DATA_DIR=/ruta/datos \
DATABASE_MIGRATIONS_DIR=/ruta/migraciones \
pnpm --filter @proxus/backend-infra db:seed:pglite
```

No ejecutes dos servidores o comandos de datos simultáneamente contra el mismo `PGLITE_DATA_DIR`. Por ese motivo no existe un publisher Feature Flags PGlite entre procesos; usa PostgreSQL local cuando publisher y servidor deban convivir.

## Motel y observabilidad local

Motel `0.2.6` está fijado en `pnpm-lock.yaml` y requiere Bun 1.3 o posterior. Para abrir la TUI e iniciar o reutilizar su daemon:

```bash
pnpm dev:motel
```

Para gestionar solamente el daemon:

```bash
pnpm motel:daemon
pnpm motel:status
pnpm motel:stop
```

Endpoints OTLP/HTTP:

```text
http://127.0.0.1:27686/v1/traces
http://127.0.0.1:27686/v1/logs
```

Motel guarda estado y logs fuera del repositorio:

```text
~/.local/state/motel/telemetry.sqlite
~/.local/state/motel/daemon.log
```

Actualmente Proxus todavía no exporta telemetría, por lo que Motel permanecerá vacío hasta incorporar las Layers OTLP.

## Comandos habituales

```bash
pnpm dev
pnpm dev:admin
pnpm dev:web

# Procesos individuales
pnpm dev:server
pnpm dev:admin-server
pnpm dev:web-front
pnpm dev:admin-front

pnpm dev:storybook

pnpm typecheck
pnpm build
pnpm test
pnpm effect:diagnostics
pnpm validate:self-test
pnpm static
pnpm check
pnpm validate:pr
```

`pnpm check` ejecuta únicamente `typecheck` y `build`. `pnpm static` ejecuta diagnostics de Effect, typecheck, ESLint type-aware, dependency-cruiser, Knip y contratos de packages. `pnpm validate:pr` añade primero el self-test de esos validadores y después los tests Vitest/PGlite implementados y todos los builds.

Validación normativa del proyecto:

```bash
pnpm validate:self-test
pnpm static
pnpm test:ci
pnpm build
```

El job principal del workflow de CI invoca esa secuencia mediante `pnpm validate:pr`. Un job independiente levanta PostgreSQL 17, aplica las migraciones y ejecuta la suite real mínima de Infra; `validate:pr` local sigue sin requerir PostgreSQL ni Docker. CI todavía no ejecuta un runner de browser. Los tests DOM/componentes no equivalen a journeys en un navegador real.

## PostgreSQL y ejecución de producción

El script de producción usa PostgreSQL, no PGlite. Primero aplica las migraciones explícitamente y después arranca el servidor:

```bash
DATABASE_URL=postgresql://user:pass@host/database \
pnpm --filter @proxus/backend-infra db:migrate:postgres

# Solo contra una base desechable propiedad del test; falla si falta DATABASE_URL.
DATABASE_URL=postgresql://user:pass@host/test_database \
pnpm --filter @proxus/backend-infra test:postgres

DATABASE_URL=postgresql://user:pass@host/database \
pnpm --filter @proxus/server start
```

El arranque comprueba que no haya migraciones pendientes, pero no las aplica. El publisher de Feature Flags hace la misma comprobación antes de validar/publicar una revisión `>= 1`:

```bash
DATABASE_URL=postgresql://user:pass@host/database \
pnpm --filter @proxus/backend-infra db:publish-feature-flags ./snapshot.json
```

Variables disponibles:

```text
DATABASE_URL                  obligatoria en producción y en QA compartida/PostgreSQL
DATABASE_MIGRATIONS_DIR       por defecto `packages/backend-infra/drizzle` (resuelto por Infra)
PGLITE_DATA_DIR               datos del único proceso PGlite de desarrollo
HOST                          por defecto 0.0.0.0
PORT                          3000 público; 3001 admin por defecto
NODE_ENV                      production selecciona las composition roots productivas
AUTH_EMAIL_ADAPTER            console solo desarrollo; producción exige un adapter real
AUTH_GOOGLE_ADAPTER           fake solo desarrollo; producción exige un adapter real
AUTH_GOOGLE_SIGNING_SECRET    obligatorio y redacted en producción; mínimo 32 bytes
```

La composición de desarrollo imprime únicamente los mensajes/códigos email en el sink consola y ofrece Google fake. Producción exige `email=mailgun` y `google=real`: email usa el adapter Mailgun configurado desde Secret Manager, mientras Google continúa fallando cerrado hasta disponer de su adapter real. No uses el secreto de desarrollo ni fixtures QA fuera de local/test. Consulta [`docs/architecture/identity-and-authentication.md`](./docs/architecture/identity-and-authentication.md).

### Smoke QA de Identity y Admin

1. Usa una PostgreSQL 17 desechable y aplica `db:migrate:postgres`.
2. Carga/lista las cinco fixtures con los comandos QA en un entorno de desarrollo compatible.
3. Arranca API pública, API admin, web y admin contra la misma base.
4. Comprueba login/logout y sesión; admin puede gestionar roles/catálogo, editor solo catálogo, ambos estudiantes reciben `403` y pending no inicia sesión.
5. Completa un registro email leyendo el código solo de la consola y el flujo Google fake; inspecciona que la cookie sea `HttpOnly` y que URL/storage no contengan secretos.

Los comandos QA actuales usan PGlite; mientras no acepten `DATABASE_URL`, los pasos 2–5 con ambas APIs requieren crear fixtures equivalentes en la base PostgreSQL de QA o quedan bloqueados. No se debe apuntar dos procesos al mismo PGlite.

## Infraestructura GCP

`@proxus/infra` declara Pulumi TypeScript para `foundation`, `production` y previews `pr-<number>` en `europe-southwest1`. Los tres proyectos usan state GCS versionado y secretos de state cifrados con KMS; production/preview referencian foundation mediante `organization/proxus-foundation/foundation` en el backend DIY.

Solo foundation y su bootstrap GCS/KMS han sido provisionados. El preview posterior registrado mostró 48 recursos sin cambios. Production y previews están implementados, pero no aplicados: faltan los gates manuales de runtime, datos/secretos, DNS y smoke tests del runbook. No uses estos comandos para desplegar sin aprobación operativa.

Cloud Build construye/publica cuatro imágenes (`server`, `admin-server`, `web`, `admin-web`), verifica el SHA de provenance y entrega digests a Pulumi; no despliega. Los backends cloud usan los roots productivos Node/PostgreSQL, nunca `apps/dev-server` ni PGlite. Production declara web GCS privada + Cloud CDN y Admin con IAP directo; previews protegen con IAP tanto la web pública como Admin. El grupo IAP y los IDs de Secret Manager/Neon son configuración externa, no valores fijados en el repositorio.

Validación local sin apply:

```bash
pnpm --filter @proxus/infra typecheck
pnpm --filter @proxus/infra test
bash -n infra/scripts/bootstrap-state.sh
pnpm infra preview --environment foundation
```

No uses principals públicos, claves JSON o valores secretos en config Pulumi. Consulta la normativa [`docs/infrastructure/gcp-pulumi.md`](./docs/infrastructure/gcp-pulumi.md) y el [`runbook`](./docs/runbooks/gcp-pulumi.md) antes de cualquier operación.

## Referencias locales

Los repositorios de referencia viven como submodules bajo `.repos/`:

```bash
git submodule update --init --recursive
```

La documentación normativa está en `docs/`; la guía de Effect comienza en [`docs/effect/README.md`](./docs/effect/README.md).

## Resolución de problemas

### Corepack no encuentra pnpm

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm --version
```

### Motel indica que falta Bun

```bash
bun --version
```

Debe mostrar 1.3.0 o posterior. Entra de nuevo en `nix develop` o instala una versión compatible.

### Un puerto está ocupado

En Linux, por ejemplo:

```bash
ss -ltnp | grep ':3000'
```

Para Motel:

```bash
pnpm motel:status
pnpm motel:stop
```

### PGlite está bloqueado

Detén el servidor y cualquier comando que use el mismo directorio `.data`. No borres `postmaster.pid` mientras exista un proceso activo. Para reconstruir los datos locales:

```bash
pnpm --filter @proxus/backend-infra db:reset:pglite
```

### Los frontends no alcanzan la API

Confirma que la API pública responde en `http://localhost:3000` y, para Admin, que la API administrativa responde en `http://localhost:3001`.

### Motel está vacío

Es el comportamiento esperado por ahora: Motel está instalado, pero la aplicación aún no tiene exportadores OTLP configurados.
