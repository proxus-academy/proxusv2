import { Schema } from "effect"

export const Locale = Schema.Literals(["es", "en"])
export type Locale = typeof Locale.Type

export interface MessagesCatalog {
  readonly language: {
    readonly label: string
    readonly spanish: string
    readonly english: string
    readonly device: string
  }
  readonly common: {
    readonly back: string
    readonly retry: string
  }
  readonly registration: {
    readonly country: { readonly title: string; readonly description: string }
    readonly type: { readonly title: string; readonly description: string }
    readonly university: { readonly title: string; readonly description: string }
    readonly degree: { readonly title: string; readonly description: string }
    readonly subject: { readonly title: string; readonly description: string }
    readonly complete: { readonly title: string; readonly description: string }
    readonly progress: (input: { readonly current: number; readonly total: number }) => string
    readonly longDescription: string
    readonly landingLoading: string
    readonly restart: string
    readonly home: string
    readonly homeShort: string
    readonly empty: string
    readonly loading: string
    readonly navigation: string
  }
  readonly errors: {
    readonly unexpected: string
    readonly unavailable: string
    readonly studyCatalog: {
      readonly nodeNotFound: string
      readonly edgeNotFound: string
    }
  }
}

const esCatalog = {
  language: { label: "Idioma", spanish: "Español", english: "English", device: "Usar idioma del dispositivo" },
  common: { back: "Atrás", retry: "Reintentar" },
  registration: {
    country: { title: "¿Dónde estudias?", description: "Selecciona tu país para comenzar" },
    type: { title: "¿Qué tipo de estudios cursas?", description: "Elige una opción disponible" },
    university: { title: "¿En qué universidad estudias?", description: "Selecciona tu centro" },
    degree: { title: "¿Qué grado estudias?", description: "Selecciona tu grado" },
    subject: { title: "¿Qué asignatura estudias?", description: "Ya casi hemos terminado" },
    complete: { title: "¡Todo listo!", description: "Hemos guardado tu itinerario de estudio" },
    progress: ({ current, total }) => `Paso ${current} de ${total}`,
    longDescription: "Encuentra tu comunidad académica y personaliza tu recorrido en pocos pasos.",
    landingLoading: "Cargando experiencia de registro",
    restart: "Empezar de nuevo",
    home: "Volver al inicio",
    homeShort: "Inicio",
    empty: "No hay opciones disponibles todavía.",
    loading: "Cargando opciones",
    navigation: "Navegación del registro",
  },
  errors: {
    unexpected: "Ha ocurrido un error inesperado.",
    unavailable: "El servicio no está disponible. Inténtalo de nuevo.",
    studyCatalog: {
      nodeNotFound: "No se encontró el elemento solicitado.",
      edgeNotFound: "No se encontró la relación solicitada.",
    },
  },
} satisfies MessagesCatalog

const enCatalog = {
  language: { label: "Language", spanish: "Español", english: "English", device: "Use device language" },
  common: { back: "Back", retry: "Retry" },
  registration: {
    country: { title: "Where do you study?", description: "Select your country to get started" },
    type: { title: "What type of studies are you taking?", description: "Choose an available option" },
    university: { title: "Which university do you attend?", description: "Select your institution" },
    degree: { title: "What degree are you studying?", description: "Select your degree" },
    subject: { title: "What subject are you studying?", description: "You're almost done" },
    complete: { title: "All done!", description: "We've saved your study path" },
    progress: ({ current, total }) => `Step ${current} of ${total}`,
    longDescription: "Find your academic community and personalize your journey in just a few steps.",
    landingLoading: "Loading registration experience",
    restart: "Start again",
    home: "Back to start",
    homeShort: "Start",
    empty: "There are no options available yet.",
    loading: "Loading options",
    navigation: "Registration navigation",
  },
  errors: {
    unexpected: "Something went wrong.",
    unavailable: "The service is unavailable. Please try again.",
    studyCatalog: {
      nodeNotFound: "The requested item could not be found.",
      edgeNotFound: "The requested relationship could not be found.",
    },
  },
} satisfies MessagesCatalog

export const catalogs = {
  es: esCatalog,
  en: enCatalog,
} satisfies Record<Locale, MessagesCatalog>

export const isLocale = (value: unknown): value is Locale => value === "es" || value === "en"

export const catalogFor = (locale: Locale): MessagesCatalog => catalogs[locale]
