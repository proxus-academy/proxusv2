# Effect Form en Proxus

Referencia fragmentada para cargar únicamente la parte de Effect Form necesaria para una tarea. Está adaptada del README upstream y debe leerse junto con las convenciones de [`24_proxus_conventions.md`](./24_proxus_conventions.md).

Proxus consume directamente `@lucas-barake/effect-form@0.25.0-beta.6` y
`@lucas-barake/effect-form-react@0.26.0-beta.5`. Sus tipos prevalecen si esta
referencia difiere de las versiones instaladas.

## Recorridos recomendados

- Formulario básico: `01`, `03`, `14`, `23` y convenciones Proxus.
- Campos dinámicos: `02`, `07` y `13`.
- Validación avanzada: `04`, `05`, `06`, `09` y `19`.
- Estado y lifecycles: `10`, `11`, `12`, `18` y `20`.
- Submit e invalidación: `14`, `15`, `16`, `21` y `22`.

## Índice

- [Installation](./00_installation.md)
- [1. Basic Form Setup](./01_basic_form_setup.md)
- [2. Array Fields](./02_array_fields.md)
- [3. Validation Modes](./03_validation_modes.md)
- [4. Cross-Field Validation (Sync Refinements)](./04_cross_field_validation.md)
- [5. Async Refinements](./05_async_refinements.md)
- [6. Async Validation with Services](./06_async_validation_with_services.md)
- [7. getFieldAtoms and setValues](./07_field_atoms_and_set_values.md)
- [8. Auto-Submit Mode](./08_auto_submit_mode.md)
- [9. Debounced Validation](./09_debounced_validation.md)
- [10. isDirty Tracking](./10_dirty_tracking.md)
- [11. Track Changes Since Submit](./11_changes_since_submit.md)
- [12. Subscribing to Form State](./12_subscribing_to_form_state.md)
- [13. Subscribing to Individual Field State](./13_subscribing_to_field_state.md)
- [14. Error Display Patterns](./14_error_display_patterns.md)
- [15. Custom Submit Arguments](./15_custom_submit_arguments.md)
- [16. Reactivity (Query Invalidation)](./16_reactivity_and_invalidation.md)
- [17. Reusable Field Definitions](./17_reusable_field_definitions.md)
- [18. Persisting State Across Unmounts (KeepAlive)](./18_persisting_state_keep_alive.md)
- [19. Validate on Initialize](./19_validate_on_initialize.md)
- [20. defaultValues Are Read Once](./20_default_values_are_read_once.md)
- [Available Atoms](./21_available_atoms.md)
- [Available Operations](./22_available_operations.md)
- [Field Component Props Reference](./23_field_component_props.md)
- [Convenciones Proxus](./24_proxus_conventions.md)
- [Licencia upstream](./25_license.md)
