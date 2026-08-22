import { describe, expect, test } from "vitest"
import { campaignRulesFromFormData } from "./campaign-rules.js"

describe("campaignRulesFromFormData", () => {
  test("maps dedicated tier and bonus controls to the typed campaign contract", () => {
    const data = new FormData()
    const entries: ReadonlyArray<readonly [string, string]> = [
      ["tierId", "tier-1"], ["tierLabel", "Base"], ["tierVideoTarget", "8"], ["tierFixedAmountEuros", "240"],
      ["tierId", "tier-2"], ["tierLabel", "Pro"], ["tierVideoTarget", "12"], ["tierFixedAmountEuros", "400.50"],
      ["bonusType", "views"], ["bonusValue", "10000"], ["bonusAmountEuros", "50"],
      ["bonusType", "topN"], ["bonusValue", "25"], ["bonusAmountEuros", "100"],
    ]
    for (const [name, value] of entries) data.append(name, value)

    expect(campaignRulesFromFormData(data)).toEqual({
      tiers: [
        { id: "tier-1", label: "Base", videoTarget: 8, fixedAmountCents: 24_000 },
        { id: "tier-2", label: "Pro", videoTarget: 12, fixedAmountCents: 40_050 },
      ],
      bonusRules: [
        { _tag: "views", threshold: 10_000, amountCents: 5_000 },
        { _tag: "topN", positions: 25, amountCents: 10_000 },
      ],
    })
  })

  test("allows campaigns without bonus rules", () => {
    const data = new FormData()
    data.append("tierId", "tier-1")
    data.append("tierLabel", "Base")
    data.append("tierVideoTarget", "8")
    data.append("tierFixedAmountEuros", "240")
    expect(campaignRulesFromFormData(data).bonusRules).toEqual([])
  })
})
