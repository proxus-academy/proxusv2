const record = (value: unknown): Record<string, unknown> | undefined => typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined
const redact = (value: string) => value
  .replace(/(Bearer|token|access_token|api[_-]?key|password)([=: ]+)[^\s;,]+/gi, "$1$2[REDACTED]")
  .replace(/([?&](?:access_token|token|key)=)[^&\s]+/gi, "$1[REDACTED]")
  .slice(0, 300)

/** Extracts only bounded scalar diagnostics; response bodies, headers and native causes are discarded. */
export const sanitizedCloudError = (cause: unknown) => {
  const outer = record(cause)
  const nested = record(outer?.error)
  const response = record(outer?.response)
  const statusValue = outer?.status ?? outer?.statusCode ?? response?.status
  const status = typeof statusValue === "number" ? statusValue : undefined
  const codeValue = nested?.code ?? outer?.code ?? outer?._tag
  const gcpCode = typeof codeValue === "string" ? codeValue : undefined
  const messageValue = nested?.message ?? outer?.message
  const message = typeof messageValue === "string" ? redact(messageValue) : undefined
  return { ...(status === undefined ? {} : { status }), ...(gcpCode === undefined ? {} : { gcpCode }), ...(message === undefined ? {} : { message }) }
}
