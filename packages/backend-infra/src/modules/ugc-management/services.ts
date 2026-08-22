import { UgcContractRenderer, UgcIdGenerator, UgcVideoMetricsProvider } from "@proxus/backend-domain/ugc-management"
import { Effect, Layer, Random } from "effect"

const makeUuid = Effect.gen(function*() {
  const bytes = yield* Effect.forEach(
    Array.from({ length: 16 }),
    () => Random.nextIntBetween(0, 256, { halfOpen: true }),
  )
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.map((value) => value.toString(16).padStart(2, "0"))
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`
})

export const UgcIdGeneratorLive = Layer.succeed(UgcIdGenerator, UgcIdGenerator.of({
  next: () => makeUuid,
}))

export const UgcContractRendererLive = Layer.succeed(UgcContractRenderer, UgcContractRenderer.of({
  render: ({ creator, locale, documentType, documentNumber, address, paymentMethod }) => Effect.succeed([
    "CONTRATO DE COLABORACIÓN",
    locale === "es-ES" ? "PROGRAMA DE CREADORES PROXUS · ESPAÑA" : "PROGRAMA DE CREADORES PROXUS · LATAM",
    "",
    `Creador: ${creator.displayName}`,
    `Documento: ${documentType} ${documentNumber}`,
    `Domicilio: ${address}`,
    `Forma de pago: ${paymentMethod === "grade" ? "Grade" : "Factura"}`,
    "",
    "El Creador colaborará en campañas UGC de PROXUS mediante la creación de contenido orgánico auténtico.",
    "Cada asignación concreta su grupo, manager, tier, calendario, formatos, compensación fija y bonus aplicables.",
    "La colaboración exige respetar las fechas de publicación, las normas de contenido y la cesión acordada para cada campaña.",
    "El contrato queda aceptado electrónicamente cuando el Creador confirma su firma dentro de la plataforma.",
  ].join("\n")),
}))

export const UgcVideoMetricsProviderMock = Layer.succeed(UgcVideoMetricsProvider, UgcVideoMetricsProvider.of({
  read: (video) => {
    const seed = [...video.id].reduce((total, character) => total + character.charCodeAt(0), 0)
    return Effect.succeed({
      tiktokViews: video.tiktokUrl === null ? 0 : seed * 137,
      instagramViews: video.instagramUrl === null ? 0 : seed * 41,
      source: "mock",
    })
  },
}))

export const UgcSupportingServicesLive = Layer.mergeAll(
  UgcIdGeneratorLive,
  UgcContractRendererLive,
  UgcVideoMetricsProviderMock,
)
