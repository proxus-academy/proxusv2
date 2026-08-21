# Sitio público estático

> **Estado:** normativa de arquitectura  
> **Alcance:** `apps/web`

## Responsabilidad

`apps/web` es el sitio público de Proxus. Astro genera sus páginas como HTML estático para que la navegación informativa, el contenido editorial y las superficies de adquisición no dependan del runtime React del producto.

Pertenece a Web:

- portada y páginas informativas;
- pricing público informativo;
- blog, guías, comparativas y contenido SEO;
- careers, contacto y soporte;
- páginas legales cuando se complete su migración validada.

`apps/webapp` conserva registro, login, onboarding, sesión y producto interactivo. Un enlace entre Web y Webapp es una navegación entre aplicaciones; Web no importa atoms, routing, clientes ni adapters internos de Webapp.

```text
visitante → apps/web (Astro estático) → apps/webapp (producto React)
```

## Render y JavaScript

HTML y CSS son el mecanismo por defecto. La interactividad se implementa con elementos nativos o scripts pequeños y progresivos. Una island necesita una interacción que justifique hidratación; no se introduce React para portar mecánicamente una implementación previa.

El contenido básico debe permanecer legible y navegable sin JavaScript. Animaciones y medios respetan `prefers-reduced-motion`, no bloquean el primer render y no provocan cambios de layout evitables.

## Contenido

Astro Content Collections es el seam de publicación para familias editoriales. Su schema valida metadata durante el build y los layouts concentran canonical, social metadata y datos estructurados. Las páginas no duplican esa implementación.

`.repos/proxus` es referencia de contenido y diseño, no fuente importable ni artefacto de build. Toda migración debe comprobar vigencia, canonical y redirects antes de retirar la URL anterior.

## Integración con producto

`PUBLIC_WEBAPP_URL` selecciona el origen de `apps/webapp`; en desarrollo usa `http://localhost:5173/es`. Es obligatorio, válido y HTTPS durante un build de producción. Los CTAs usan enlaces normales y pueden preservar únicamente parámetros de atribución explícitamente permitidos. Web no accede a persistencia. Si una futura página necesita información dinámica, consume un contrato de `PublicApi`.

El pricing mostrado en Web es informativo hasta disponer de una fuente pública canónica. La aplicación confirma precio, moneda y disponibilidad antes de cualquier compra.

## Rendimiento y accesibilidad

- salida estática y cacheable mediante CDN;
- ninguna dependencia de React en el primer viewport;
- imágenes dimensionadas y optimizadas;
- iframes y medios pesados tras interacción cuando sea posible;
- landmarks, navegación por teclado y focus visibles;
- canonical, sitemap, robots y metadata social generados durante el build.

Los cambios se validan como mínimo con `pnpm --filter @proxus/web typecheck`, `test` y `build`, además de la validación proporcional del workspace.
