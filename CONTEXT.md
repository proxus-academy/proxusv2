# Domain language

## Conversations

- **Thread**: conversación persistente propiedad de una cuenta. Ordena mensajes
  y agrupa las ejecuciones iniciadas dentro de esa conversación.
- **Agent Run**: ejecución completa iniciada por una petición del usuario. Puede
  terminar tras una respuesta directa o recorrer varios turns y herramientas.
- **Agent Turn**: ciclo de decisión dentro de un Agent Run. Consume el estado
  disponible, realiza una o más generaciones si hay retries y decide responder,
  invocar herramientas o continuar.
- **Model Generation**: llamada concreta a un modelo/proveedor. Es la unidad de
  tokens, coste, latencia, modelo y observabilidad AI.
- **Tool Execution**: invocación concreta de una herramienta solicitada durante
  un Agent Turn, con estado, duración y resultado tipado.
- **Observation Payload**: captura restringida y versionada de inputs/outputs
  técnicos almacenada fuera de PostgreSQL para diagnóstico autorizado. No es
  la fuente autoritativa de mensajes de producto.
