# Alchemy GCS state seam

Este adapter implementa `StateService` de Alchemy `2.0.0-beta.65` para todos los stacks remotos: `foundation`, `preview-platform`, `production` y `preview` (`pr-<number>`). Los clientes KMS, GCS y clock son inyectables; los tests no usan cloud. Bootstrap es la excepción y usa state local porque crea/adopta el backend.

## Documento atómico y fencing

Cada `(stack, stage)` tiene un único objeto GCS cifrado:

```text
alchemy-state/v2/<encoded-stack>/<encoded-stage>
```

El plaintext solo existe alrededor de las operaciones KMS del cliente. El documento contiene lease, resource map y outputs. Acquire, renew, release y cada mutación reescriben el documento completo con precondición de generación GCS; no existe lock separado.

El lease (`owner`, `leaseId` no adivinable y expiración) actúa como identity fence. El wrapper padre adquiere el lease, lo renueva mientras el child Alchemy opera, inyecta `ALCHEMY_LEASE_*` y lo libera al terminar. Antes de cada operación se refrescan generación e identidad. Las transacciones read/merge/CAS del mismo proceso se serializan por cliente y documento; además, un coordinador compartido por proceso y documento separa el inicio de todas las mutaciones CAS al menos 1,1 s (intervalo, reloj y espera son inyectables). La espera ocurre antes de tomar el mutex documental, por lo que una ráfaga del child no bloquea la renovación del parent. Los conflictos con otro proceso se reintentan de forma acotada releyendo y fusionando el documento completo. Cada reintento vuelve a validar lease, `leaseId` y expiración: solo preserva escrituras de la misma identidad cercada, nunca acepta un writer externo ni un lease reemplazado. Una identidad expirada o reemplazada no puede leer, renovar, liberar ni escribir aunque coincida una generación antigua. Release limpia el lease, no el state.

El servicio queda ligado al stack/stage exacto del lease. Como la API beta.65 no pasa leases ni representa un borrado atómico multi-stage, se rechazan operaciones cruzadas y el caller debe bloquear cada stage. Las operaciones idempotentes GCS (`read`, `list` y escrituras CAS que reutilizan ciphertext y `ifGenerationMatch`) reintentan únicamente HTTP 429/5xx con backoff exponencial, jitter y `Retry-After` acotados; una espera mayor de `Retry-After` retrasa también las siguientes mutaciones encoladas. El coste deliberado es latencia lineal: una ráfaga de 30 mutaciones tarda como mínimo unos 32 s entre el primer y último inicio (y más con retries), a cambio de permanecer bajo el límite por objeto de GCS. Los 4xx permanentes y KMS no se reintentan; 412 sigue siendo conflicto y entra en el merge loop. Solo ciphertext llega a GCS; los errores conservan únicamente operación, status y attempt sanitizados y nunca documento, plaintext, ciphertext, credenciales o cuerpos HTTP.

El bucket debe conservar versionado, uniform bucket-level access y public access prevention. No se editan documentos, generaciones o leases manualmente. La normativa y recuperación están en [`../../../../docs/infrastructure/gcp-alchemy.md`](../../../../docs/infrastructure/gcp-alchemy.md) y [`../../../../docs/runbooks/gcp-alchemy.md`](../../../../docs/runbooks/gcp-alchemy.md).
