# @proxus/site

Sitio público estático de Proxus, construido con Astro.

```bash
pnpm dev:site
pnpm --filter @proxus/site typecheck
pnpm --filter @proxus/site build
```

`PUBLIC_PRODUCT_URL` define el origen o base path de los enlaces al producto. El
valor local por defecto es `http://localhost:5173`; Site conserva español sin
prefijo y añade `/en` para los enlaces ingleses.

Astro genera las rutas estáticas españolas en `/` y las inglesas bajo `/en`.
`astro:i18n` posee el routing y Paraglide compila los mensajes desde el proyecto
compartido `../../project.inlang`. El contenido editorial mantiene una entrada
por idioma en la colección `blog`.

Consulta [`docs/architecture/public-site.md`](../../docs/architecture/public-site.md) para las reglas de propiedad, contenido e interactividad.
