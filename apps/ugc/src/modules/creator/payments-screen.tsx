import { WalletCards } from "lucide-react"
import type { Currency, UgcPayment, UgcWorkspace } from "@proxus/shared/ugc-management"
import { Navigate } from "@tanstack/react-router"
import { WorkspaceState } from "../workspace/workspace-state.js"
import { canAccessCreatorLibrary } from "./creator-access.js"

const money = (cents: number, currency: Currency) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency })
const statusLabel = { pending: "Pendiente", paid: "Pagado", cancelled: "Cancelado" } as const
const paymentTitle = (payment: UgcPayment, campaigns: ReadonlyMap<string, string>) => payment.kind === "trial_compensation"
  ? "Periodo de prueba"
  : payment.campaignId === null ? "Incentivo" : campaigns.get(payment.campaignId) ?? "Campaña"

export function PaymentsScreen() {
  return <WorkspaceState>{(workspace) => <CreatorPaymentsView workspace={workspace} />}</WorkspaceState>
}

function CreatorPaymentsView({ workspace }: { readonly workspace: UgcWorkspace }) {
  if (!canAccessCreatorLibrary(workspace)) return <Navigate to="/ugc" replace />
  const campaigns = new Map(workspace.campaigns.map((campaign) => [campaign.id, campaign.name]))
  const summaryCurrency = workspace.payments[0]?.currency ?? "EUR"
  const total = workspace.payments.filter((payment) => payment.currency === summaryCurrency).reduce((sum, payment) => sum + payment.amountCents, 0)
  const pending = workspace.payments.filter((payment) => payment.currency === summaryCurrency && payment.status === "pending").reduce((sum, payment) => sum + payment.amountCents, 0)
  return <div><p className="text-sm font-bold text-[#793ef9]">TUS INGRESOS</p><h1 className="mt-2 text-3xl font-bold">Pagos</h1><p className="mt-2 text-slate-500">Consulta las compensaciones de pruebas y campañas.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="ugc-card p-5"><p className="text-sm text-slate-500">Total generado</p><p className="mt-2 text-3xl font-bold">{money(total, summaryCurrency)}</p></div><div className="ugc-card p-5"><p className="text-sm text-slate-500">Pendiente de pago</p><p className="mt-2 text-3xl font-bold">{money(pending, summaryCurrency)}</p></div></div>
    <section className="ugc-card mt-5 overflow-hidden">{workspace.payments.length === 0 ? <div className="grid min-h-64 place-items-center text-center"><div><WalletCards className="mx-auto size-8 text-slate-300" /><p className="mt-3 font-semibold">Todavía no tienes pagos</p><p className="mt-1 text-sm text-slate-500">Aparecerán al completar una prueba o cerrar una campaña.</p></div></div> : <div className="divide-y divide-slate-100">{workspace.payments.map((payment) => <article key={payment.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><h2 className="font-bold">{paymentTitle(payment, campaigns)}</h2><p className="mt-1 text-sm text-slate-500">Base {money(payment.breakdown.fixedAmountCents, payment.currency)} · Bonus {money(payment.breakdown.viewsBonusCents + payment.breakdown.rankingBonusCents + payment.breakdown.referralBonusCents, payment.currency)}</p>{payment.breakdown.adjustmentReason === null ? null : <p className="mt-1 text-xs text-slate-500">{payment.breakdown.adjustmentReason}</p>}</div><div className="sm:text-right"><p className="text-xl font-bold">{money(payment.amountCents, payment.currency)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{statusLabel[payment.status]}</p></div></article>)}</div>}</section>
  </div>
}
