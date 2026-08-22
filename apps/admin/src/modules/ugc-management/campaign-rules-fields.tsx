import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type RowState = { readonly ids: ReadonlyArray<number>; readonly nextId: number }

export function CampaignRulesFields() {
  const [tiers, setTiers] = useState<RowState>({ ids: [0], nextId: 1 })
  const [bonuses, setBonuses] = useState<RowState>({ ids: [0], nextId: 1 })
  return <div className="grid gap-5">
    <fieldset className="grid gap-3 rounded-xl border p-4">
      <legend className="px-1 text-sm font-semibold">Tiers de la campaña</legend>
      <p className="text-xs text-muted-foreground">Define el objetivo de vídeos y el pago fijo de cada nivel.</p>
      {tiers.ids.map((id, index) => <TierRow key={id} id={id} index={index} removable={tiers.ids.length > 1} onRemove={() => setTiers((current) => ({ ...current, ids: current.ids.filter((item) => item !== id) }))} />)}
      <Button type="button" variant="outline" onClick={() => setTiers((current) => ({ ids: [...current.ids, current.nextId], nextId: current.nextId + 1 }))}><Plus />Añadir tier</Button>
    </fieldset>
    <fieldset className="grid gap-3 rounded-xl border p-4">
      <legend className="px-1 text-sm font-semibold">Bonificaciones</legend>
      <p className="text-xs text-muted-foreground">Añade reglas por visualizaciones, ranking o referidos. Son opcionales.</p>
      {bonuses.ids.length === 0 ? <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Sin bonificaciones configuradas.</p> : bonuses.ids.map((id, index) => <BonusRow key={id} id={id} index={index} onRemove={() => setBonuses((current) => ({ ...current, ids: current.ids.filter((item) => item !== id) }))} />)}
      <Button type="button" variant="outline" onClick={() => setBonuses((current) => ({ ids: [...current.ids, current.nextId], nextId: current.nextId + 1 }))}><Plus />Añadir bonificación</Button>
    </fieldset>
  </div>
}

function TierRow({ id, index, removable, onRemove }: { readonly id: number; readonly index: number; readonly removable: boolean; readonly onRemove: () => void }) {
  const ordinal = index + 1
  return <div className="grid gap-3 rounded-lg bg-muted/35 p-3 sm:grid-cols-2">
    <label className="grid gap-1 text-xs font-medium" htmlFor={`tier-${id}-label`}>Nombre visible<Input id={`tier-${id}-label`} name="tierLabel" defaultValue={`Tier ${id + 1}`} required /></label>
    <label className="grid gap-1 text-xs font-medium" htmlFor={`tier-${id}-id`}>Identificador<Input id={`tier-${id}-id`} name="tierId" defaultValue={`tier-${id + 1}`} required /></label>
    <label className="grid gap-1 text-xs font-medium" htmlFor={`tier-${id}-target`}>Objetivo de vídeos<Input id={`tier-${id}-target`} name="tierVideoTarget" type="number" min="1" defaultValue="8" required /></label>
    <label className="grid gap-1 text-xs font-medium" htmlFor={`tier-${id}-amount`}>Pago fijo (€)<Input id={`tier-${id}-amount`} name="tierFixedAmountEuros" type="number" min="0" step="0.01" defaultValue="400" required /></label>
    {removable ? <Button className="sm:col-span-2 sm:justify-self-end" type="button" size="sm" variant="ghost" aria-label={`Eliminar tier ${ordinal}`} onClick={onRemove}><Trash2 />Eliminar tier</Button> : null}
  </div>
}

function BonusRow({ id, index, onRemove }: { readonly id: number; readonly index: number; readonly onRemove: () => void }) {
  const ordinal = index + 1
  const [type, setType] = useState("views")
  const valueLabel = type === "topN" ? "Número de posiciones" : type === "referrals" ? "Número de referidos" : "Visualizaciones mínimas"
  return <div className="grid gap-3 rounded-lg bg-muted/35 p-3 sm:grid-cols-3">
    <label className="grid gap-1 text-xs font-medium" htmlFor={`bonus-${id}-type`}>Tipo<select id={`bonus-${id}-type`} name="bonusType" className="h-9 rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.currentTarget.value)}><option value="views">Visualizaciones</option><option value="topN">Top N</option><option value="referrals">Referidos</option></select></label>
    <label className="grid gap-1 text-xs font-medium" htmlFor={`bonus-${id}-value`}>{valueLabel}<Input id={`bonus-${id}-value`} name="bonusValue" type="number" min="1" defaultValue="10000" required /></label>
    <label className="grid gap-1 text-xs font-medium" htmlFor={`bonus-${id}-amount`}>Importe (€)<Input id={`bonus-${id}-amount`} name="bonusAmountEuros" type="number" min="0.01" step="0.01" defaultValue="50" required /></label>
    <Button className="sm:col-span-3 sm:justify-self-end" type="button" size="sm" variant="ghost" aria-label={`Eliminar bonificación ${ordinal}`} onClick={onRemove}><Trash2 />Eliminar bonificación</Button>
  </div>
}
