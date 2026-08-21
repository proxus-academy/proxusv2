# @proxus/web

Sitio público estático de Proxus, construido con Astro.

```bash
pnpm dev:web
pnpm --filter @proxus/web typecheck
pnpm --filter @proxus/web build
```

`PUBLIC_WEBAPP_URL` define el destino base de los enlaces al producto. Es obligatorio y HTTPS en builds de producción; en desarrollo usa `http://localhost:5173/es` por defecto.

Los assets públicos canónicos viven en `public/assets` y deben estar registrados en `@proxus/assets`. Ejecuta `pnpm assets:validate` después de añadirlos o modificarlos.

Consulta [`docs/architecture/public-web.md`](../../docs/architecture/public-web.md) para las reglas de propiedad, contenido e interactividad.
