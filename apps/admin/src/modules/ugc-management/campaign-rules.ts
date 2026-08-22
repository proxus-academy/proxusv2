import { CampaignBonusRule, CampaignTier } from "@proxus/shared/ugc-management"
import { Schema } from "effect"

const strings = (data: FormData, name: string) => data.getAll(name).map(String)
const euroCents = (value: string) => Math.round(Number(value) * 100)

export function campaignRulesFromFormData(data: FormData) {
  const tierLabels = strings(data, "tierLabel")
  const tierTargets = strings(data, "tierVideoTarget")
  const tierAmounts = strings(data, "tierFixedAmountEuros")
  const tiers = strings(data, "tierId").map((id, index) => ({
    id,
    label: tierLabels[index],
    videoTarget: Number(tierTargets[index]),
    fixedAmountCents: euroCents(tierAmounts[index] ?? ""),
  }))

  const bonusValues = strings(data, "bonusValue")
  const bonusAmounts = strings(data, "bonusAmountEuros")
  const bonusRules = strings(data, "bonusType").map((type, index) => {
    const value = Number(bonusValues[index])
    const amountCents = euroCents(bonusAmounts[index] ?? "")
    if (type === "topN") return { _tag: "topN" as const, positions: value, amountCents }
    if (type === "referrals") return { _tag: "referrals" as const, threshold: value, amountCents }
    return { _tag: "views" as const, threshold: value, amountCents }
  })

  return {
    tiers: Schema.decodeUnknownSync(Schema.Array(CampaignTier))(tiers),
    bonusRules: Schema.decodeUnknownSync(Schema.Array(CampaignBonusRule))(bonusRules),
  }
}
