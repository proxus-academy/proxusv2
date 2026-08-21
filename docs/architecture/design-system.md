# Sistema de diseño como frontera arquitectónica

> **Estado:** normativa de arquitectura
> **Alcance:** `packages/ui`, `apps/web`, `apps/admin`

## Decisión

`packages/ui` es el único owner de implementación visual React. Las aplicaciones conectan estado y eventos a componentes del sistema, pero no contienen un sistema visual paralelo.

```text
atoms / route / use case → view model + callbacks → @proxus/ui → DOM + CSS
```

La frontera incluye:

- tokens, fuentes y hojas de estilo;
- primitives de interacción y layout;
- patrones de producto y shells de pantalla;
- adapters visuales de Radix y componentes generados;
- markup host que tenga semántica o apariencia visual.

Un pattern puede ser específico de Auth, Registration, Admin o Study Catalog. Sigue siendo UI mientras solo reciba datos planos y callbacks y no importe atoms, routing, transporte ni casos de uso. Esta separación permite desarrollar esos estados en Storybook y evita que cada aplicación invente spacing, accesibilidad o variantes.

## Reglas ejecutables

En código de producción de `apps/web/src` y `apps/admin/src`:

1. no se admiten `className`, `style`, CSS local ni imports directos de librerías de styling;
2. no se admiten tags JSX host en minúscula;
3. la única excepción es `<div>` sin ninguna prop, reservado a agrupación estructural neutra;
4. Tailwind, Radix, CVA, `clsx` y `tailwind-merge` se encapsulan en `packages/ui`;
5. no se admiten directorios locales `components/ui`, `ui` o `styles`.

Oxlint comprueba el markup y el styling; dependency-cruiser comprueba imports; `pnpm ui:architecture` comprueba filesystem y manifiestos. `pnpm static` ejecuta los tres niveles y `pnpm validate:self-test` demuestra que los gates fallan ante infracciones deliberadas.

## Cómo evolucionar el sistema

Cuando una pantalla necesite algo que no existe:

1. buscar una primitive o pattern existente;
2. extender una variante si mantiene la misma semántica;
3. crear una primitive si la capacidad es transversal;
4. crear un pattern con view model plano si la composición es propia de una superficie;
5. añadir stories para estados visuales relevantes.

No se añade una prop genérica de clase como vía de escape. La API debe expresar la decisión (`gap`, `tone`, `density`, `width`, `align`) con valores controlados.

## Referencias revisadas

- [Primer](https://primer.style/product/) separa foundations, components y patterns. Su guía de shared components coloca patrones de feature en paquetes UI y recomienda apoyarse primero en Primer.
- [Atlassian Design System ESLint](https://atlassian.design/components/eslint-plugin-design-system/) convierte la adopción del sistema en reglas ejecutables; en particular, `use-primitives` empuja el layout hacia primitives.
- [React Spectrum Architecture](https://react-spectrum.adobe.com/architecture.html) separa estado, comportamiento accesible y componente renderizado. Proxus conserva atoms y casos de uso fuera de UI y concentra el render estilizado en UI.
- [Shopify Polaris](https://polaris-react.shopify.com/) organiza componentes, tokens, tooling y documentación como productos del sistema. Su implementación React histórica es útil para estudiar el monorepo, aunque Shopify la sustituyó por Web Components en 2025.

Proxus adopta una frontera más estricta que estos proyectos: no solo recomienda primitives, sino que impide que las aplicaciones creen una segunda superficie visual. Es una decisión consciente para obligar a reutilizar, actualizar y mejorar el sistema de diseño.

## Alcance de Astro

`apps/site` usa Astro estático y sigue la normativa específica de [`public-site.md`](public-site.md). Su HTML es output editorial del compilador, no una aplicación React, por lo que estas reglas JSX no se aplican de forma ficticia sobre otro lenguaje. La convergencia de tokens y patterns multiplataforma debe hacerse mediante una API Astro propia de UI antes de prohibir su markup; no se presenta la cobertura React como si cubriera Site.
