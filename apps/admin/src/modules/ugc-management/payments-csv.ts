import type { UgcCampaign, UgcPayment, UgcUser } from "@proxus/shared/ugc-management"

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`

export const pendingPaymentsCsv = (
  payments: ReadonlyArray<UgcPayment>,
  users: ReadonlyArray<UgcUser>,
  campaigns: ReadonlyArray<UgcCampaign>,
) => {
  const rows = payments.reduce<Array<ReadonlyArray<string | number>>>((pending, payment) => {
    if (payment.status !== "pending") return pending
    const creator = users.find((user) => user.id === payment.creatorId)
    const campaign = campaigns.find((item) => item.id === payment.campaignId)
    pending.push([payment.id, creator?.displayName ?? payment.creatorId, creator?.email ?? "", campaign?.name ?? payment.campaignId, payment.amountCents, "EUR", payment.status])
    return pending
  }, [["payment_id", "creator", "email", "campaign", "amount_cents", "currency", "status"]])
  return rows.map((row) => row.map(csvCell).join(",")).join("\n")
}

export const downloadPendingPaymentsCsv = (csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = "ugc-pagos-pendientes.csv"
  link.click()
  URL.revokeObjectURL(url)
}
