# Assets públicos compartidos

> **Estado:** normativa de arquitectura
> **Alcance:** `apps/web`, `apps/webapp` y `packages/assets`

## Propiedad y publicación

Todos los assets estáticos de producto son públicos y su único origen físico en el workspace es `apps/web/public/assets`. Web los publica como archivos estáticos; Webapp no mantiene copias en `src/assets` ni `public/assets`.

`packages/assets/manifest.json` es la fuente de verdad tipada. Cada imagen publicada tiene exactamente una entrada con ID semántico, path, MIME, dimensiones, bytes y SHA-256. `packages/assets/src/index.ts` expone `AssetId`, metadatos y resolución de URLs sin acoplar consumidores a la ruta física del workspace.

```text
apps/web/public/assets ── valida 1:1 ── packages/assets/manifest.json
                                            │
                                            ├── apps/web
                                            └── apps/webapp
```

No se escriben URLs de imagen externas a mano en superficies de producto. Los consumidores seleccionan un `AssetId` y lo resuelven contra el origen configurado.

## Configuración entre aplicaciones

Web recibe `PUBLIC_WEBAPP_URL`. Webapp recibe `VITE_WEB_URL` y `VITE_ASSET_BASE_URL`. Las tres variables son obligatorias y HTTPS en builds de producción; los valores locales tienen defaults explícitos. Una base relativa `/` está permitida únicamente para que los previews sirvan los assets copiados desde el build de Web en el mismo origen dinámico.

`VITE_WEB_URL` y `VITE_ASSET_BASE_URL` permanecen separados aunque hoy apunten al mismo origen: navegación pública y distribución de assets pueden evolucionar de forma independiente. Solo el composition root lee variables de Vite; módulos de producto reciben configuración validada.

## Gates y despliegue

`pnpm assets:validate` falla ante archivos ausentes o no registrados, paths inseguros, contenido duplicado, MIME o dimensiones incorrectos, hashes distintos, archivos vacíos, más de 500 KB o assets ubicados dentro de Webapp. Forma parte de `pnpm static` y tiene un job explícito de CI.

`pnpm assets:verify-remote -- https://proxus.app` descarga cada asset publicado y compara status, redirects, MIME, bytes y hash con el manifiesto. El despliegue debe publicar Web antes que una Webapp que introduzca IDs nuevos, verificar el origen remoto y ejecutar smoke tests sobre `/assets/manifest.json` y un asset crítico antes de promocionar la revisión.

Las URLs publicadas son inmutables. Cambiar contenido implica publicar un path nuevo y actualizar el manifiesto; un asset anterior no se elimina mientras una versión desplegable pueda referenciarlo. Esto conserva rollbacks seguros y permite cacheo de larga duración cuando el hosting lo configure.
