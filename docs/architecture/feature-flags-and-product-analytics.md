# Feature flags y product analytics

> Estado: arquitectura implementada para el primer vertical A/B (2026-07-18)

## Modelo

No existe `Experiment` ni lifecycle experimental. Una revisión inmutable distribuye flags `enabled`/`disabled`; cada bundle mantiene la unión cerrada de variantes que sabe renderizar. El primer flag es `registration.landing`, variantes `short` y `long`. Deshabilitado, ausente, inválido o desconocido usa `short` de forma segura.

La decisión se obtiene con el flujo `view → adapter frontend → snapshot HTTP`. El adapter web conserva una identidad anónima UUID v4 por instalación y una decisión ya vista por `(subject, flagKey, revision)`. Web y mobile-web comparten algoritmo y almacenamiento cuando se ejecutan en el mismo navegador. Sin consentimiento la UI se asigna igualmente, pero no se realiza ninguna petición analytics.

## Identidad y transición a principal

Hoy no hay autenticación pública y no se inventa una. `ProductAnalyticsHttpContext` es el seam de transporte para consentimiento e identidad verificadas; producción falla cerrada. Desarrollo permite exclusivamente same-origin, consentimiento explícito y un subject UUID enviado en un header marcado como desarrollo.

Cuando exista auth, el adapter de ese seam resolverá un principal estable del servidor. La política de transición debe:

1. buscar decisiones ya vistas de la instalación y preservarlas para la revisión activa;
2. vincularlas al principal mediante almacenamiento server-side, sin reasignar la UI montada;
3. usar el principal como unidad en dispositivos/plataformas posteriores, de modo que una flag común produzca la misma variante;
4. no aceptar account IDs ni subjects autoritativos en el body analytics.

Hasta entonces solo se garantiza estabilidad por instalación; no se afirma identidad cross-device.

## Analytics

Los eventos cerrados son `feature_flag_exposed`, `registration_started` y `registration_completed`. Cada envelope segmentable materializa de forma inmutable `flagKey`, `variant`, `revision` y `subjectId`. Consentimiento e identidad son contexto de transporte, no propiedades confiadas al evento. El servicio rechaza subjects inválidos y reconstruye la asignación de la revisión local inicial cuando es viable; una futura historia de snapshots permitirá verificar revisiones remotas antiguas.

La exposición es opcional y ocurre al montar la superficie. El adapter reduce duplicados por `(subject, flag, revision)` y tolera el doble montaje de Strict Mode. Inicio se emite en la primera selección y finalización al elegir la asignatura. La cola y persistencia continúan siendo best-effort y nunca cambian el registro.

Un evento de negocio backend debe permanecer libre de campos analíticos. Cuando exista un caso de uso backend real de finalización, este publicará `RegistrationCompleted` en el catálogo de eventos y una reaction de analytics incorporará el contexto de asignación verificado. No se crea ese evento ni una reaction vacía mientras el registro siga siendo exclusivamente cliente.

## Operación

Un snapshot del piloto tiene esta forma:

```json
{
  "configurationRevision": 1,
  "flags": [{
    "key": "registration.landing",
    "enabled": true,
    "allocationVersion": 1,
    "default": "short",
    "variants": [{ "value": "short", "weight": 5000 }, { "value": "long", "weight": 5000 }]
  }]
}
```

No se deben interpretar estos datos como autorización ni como evidencia de causalidad por sí solos.
