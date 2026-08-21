# Sitio público estático

> **Estado:** normativa de arquitectura  
> **Alcance:** `apps/site`

## Responsabilidad

`apps/site` es el sitio público de Proxus. Astro genera sus páginas como HTML estático para que la navegación informativa, el contenido editorial y las superficies de adquisición no dependan del runtime React del producto.

Pertenece a Site:

- portada y páginas informativas;
- pricing público informativo;
- blog, guías, comparativas y contenido SEO;
- careers, contacto y soporte;
- páginas legales cuando se complete su migración validada.

`apps/web` conserva registro, login, onboarding, sesión y producto interactivo. Un enlace desde Site a Web es una navegación entre aplicaciones; Site no importa atoms, routing, clientes ni adapters internos de Web.

```text
visitante → apps/site (Astro estático) → apps/web (producto React)
```

## Render y JavaScript

HTML y CSS son el mecanismo por defecto. La interactividad se implementa con elementos nativos o scripts pequeños y progresivos. Una island necesita una interacción que justifique hidratación; no se introduce React para portar mecánicamente una implementación previa.

El contenido básico debe permanecer legible y navegable sin JavaScript. Animaciones y medios respetan `prefers-reduced-motion`, no bloquean el primer render y no provocan cambios de layout evitables.

## Contenido

Astro Content Collections es el seam de publicación para familias editoriales. Su schema valida metadata durante el build y los layouts concentran canonical, social metadata y datos estructurados. Las páginas no duplican esa implementación.

`.repos/proxus` es referencia de contenido y diseño, no fuente importable ni artefacto de build. Toda migración debe comprobar vigencia, canonical y redirects antes de retirar la URL anterior.

## Internacionalización

Site publica español como locale base sin prefijo e inglés bajo `/en`. Astro es
el único propietario del routing localizado y genera enlaces, canonicals y
alternates mediante `astro:i18n`. Paraglide compila los mensajes tipados y el
middleware de prerender sincroniza su locale con `Astro.currentLocale`; Site no
usa `paraglideMiddleware`, porque no existe una request de producción en la
salida estática.

El proyecto Inlang compartido vive en `project.inlang`. Cada aplicación conserva
su catálogo (`apps/site/messages` y `apps/web/messages`) y compila un runtime
propio con la estrategia adecuada a su plataforma. Los módulos generados bajo
`src/paraglide` no se versionan. Las copias editoriales largas permanecen en
Content Collections y declaran su locale; no se trasladan a funciones de mensaje.

Cada ruta informativa publicada en español debe tener una variante inglesa o
una decisión explícita de fallback. El layout genera `lang`, `dir`, canonical,
`hreflang`, `x-default` y `og:locale` desde el locale efectivo. Cambiar de idioma
es navegar a otro documento estático, no mutar estado cliente.

## Integración con producto

`PUBLIC_PRODUCT_URL` selecciona el origen o base path de `apps/web`; en desarrollo usa `http://localhost:5173`. Site añade `/en` para destinos ingleses y mantiene español sin prefijo. En preview, un valor `/app` produce `/app` y `/app/en`. Los CTAs usan enlaces normales y pueden preservar únicamente parámetros de atribución explícitamente permitidos. Site no accede a persistencia. Si una futura página necesita información dinámica, consume un contrato de `PublicApi`.

El pricing mostrado en Site es informativo hasta disponer de una fuente pública canónica. La aplicación confirma precio, moneda y disponibilidad antes de cualquier compra.

## Rendimiento y accesibilidad

- salida estática y cacheable mediante CDN;
- ninguna dependencia de React en el primer viewport;
- imágenes dimensionadas y optimizadas;
- iframes y medios pesados tras interacción cuando sea posible;
- landmarks, navegación por teclado y focus visibles;
- canonical, sitemap, robots y metadata social generados durante el build.

Los cambios se validan como mínimo con `pnpm --filter @proxus/site typecheck`, `test` y `build`, además de la validación proporcional del workspace.
