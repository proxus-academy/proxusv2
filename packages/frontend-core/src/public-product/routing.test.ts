import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { productRoutes } from "./routing.js"

const matchIds = (pathname: string) =>
  Effect.runSync(productRoutes.decode(pathname)).matches.map(({ id }) => id)

describe("product route access layouts", () => {
  it("matches visitor routes through public-only", () => {
    expect(matchIds("/es")).toEqual([
      "root", "locale", "product", "public-only", "registration",
    ])
    expect(matchIds("/es/login")).toEqual([
      "root", "locale", "product", "public-only", "login",
    ])
    expect(matchIds("/es/password-recovery/code")).toEqual([
      "root", "locale", "product", "public-only", "password-recovery-flow",
      "password-recovery-code",
    ])
  })

  it("matches application routes through authenticated", () => {
    expect(matchIds("/es/app")).toEqual([
      "root", "locale", "product", "authenticated", "home",
    ])
  })
})
