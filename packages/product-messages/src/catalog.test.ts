import { describe, expect, it } from "vitest"
import { createProductI18n, resources } from "./catalog.js"

describe("product i18n resources", () => {
  it("formats shared messages in every locale", () => {
    const es = createProductI18n("es")
    const en = createProductI18n("en")
    expect(es.t("progress", { ns: "registration", current: 2, total: 5 })).toBe("Paso 2 de 5")
    expect(en.t("progress", { ns: "registration", current: 2, total: 5 })).toBe("Step 2 of 5")
    expect(es.t("login.title", { ns: "auth" })).toBe("Inicia sesión")
    expect(en.t("login.title", { ns: "auth" })).toBe("Sign in")
  })

  it("keeps independent instances isolated", () => {
    const es = createProductI18n("es")
    const en = createProductI18n("en")
    expect(es.language).toBe("es")
    expect(en.language).toBe("en")
    void es.changeLanguage("en")
    expect(en.language).toBe("en")
  })

  it("provides the same namespaces in both resources", () => {
    const paths = (cause: unknown, prefix = ""): ReadonlyArray<string> =>
      typeof cause === "object" && cause !== null
        ? Object.entries(cause).flatMap(([key, child]) => paths(child, prefix === "" ? key : `${prefix}.${key}`))
        : [prefix]
    expect(paths(resources.en)).toEqual(paths(resources.es))
  })
})
