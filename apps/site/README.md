# @proxus/site

Sitio público estático de Proxus, construido con Astro.

```bash
pnpm dev:site
pnpm --filter @proxus/site typecheck
pnpm --filter @proxus/site build
```

`PUBLIC_PRODUCT_URL` define el destino base de los enlaces al producto. El valor local por defecto es `http://localhost:5173/es`.

Consulta [`docs/architecture/public-site.md`](../../docs/architecture/public-site.md) para las reglas de propiedad, contenido e interactividad.
