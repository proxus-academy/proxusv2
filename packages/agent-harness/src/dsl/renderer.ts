export interface ArtifactReference { readonly artifactId: string; readonly mediaType: string; readonly bytes: number }
export interface RenderOptions { readonly maxOutputBytes?: number; readonly redactKeys?: ReadonlyArray<string>; readonly storeArtifact?: (content: string, mediaType: string) => ArtifactReference }
export interface RenderedDslValue { readonly text: string; readonly truncated: boolean; readonly artifact?: ArtifactReference }
const bytes = (text: string) => { let n=0; for (const c of text) { const x=c.codePointAt(0)!; n += x<=0x7f?1:x<=0x7ff?2:x<=0xffff?3:4 } return n }
const redact = (value: unknown, keys: ReadonlySet<string>): unknown => Array.isArray(value) ? value.map(x=>redact(x,keys)) : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,keys.has(k.toLowerCase())?"[REDACTED]":redact(v,keys)])) : value
export const renderDslValue = (value: unknown, options: RenderOptions = {}): RenderedDslValue => {
  const limit=options.maxOutputBytes ?? 32_768
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("maxOutputBytes must be a positive safe integer")
  const safe=redact(value,new Set((options.redactKeys ?? ["token","password","secret","authorization"]).map(x=>x.toLowerCase())))
  const text=typeof safe === "string" ? safe : JSON.stringify(safe,null,2) ?? String(safe)
  const size=bytes(text)
  if (size<=limit) return { text, truncated:false }
  const artifact=options.storeArtifact?.(text,"application/json")
  const suffix=artifact !== undefined ? `\n[Output stored as artifact ${artifact.artifactId} (${artifact.bytes} bytes)]` : "\n[Output truncated]"
  let shown=""; for(const c of text){if(bytes(shown+c)+bytes(suffix)>limit)break;shown+=c}
  return { text:shown+suffix,truncated:true,...(artifact !== undefined ? {artifact}:{}) }
}
