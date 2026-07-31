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
  readonly auth: {
    readonly login: { readonly title: string; readonly email: string; readonly password: string; readonly submit: string; readonly submitting: string; readonly failed: string }
    readonly forgotPassword: { readonly title: string; readonly description: string; readonly submit: string }
    readonly recoveryCode: { readonly title: string; readonly pendingTitle: string; readonly code: string; readonly verify: string; readonly continue: string; readonly resend: string }
    readonly newPassword: { readonly title: string; readonly description: string; readonly password: string; readonly confirmation: string; readonly submit: string }
  }
  readonly validation: Readonly<Record<string, string>>
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
  auth: {
    login: { title: "Inicia sesión", email: "Email", password: "Contraseña", submit: "Iniciar sesión", submitting: "Iniciando sesión…", failed: "No se ha podido iniciar sesión" },
    forgotPassword: { title: "Recupera tu contraseña", description: "Te enviaremos un código si existe una cuenta asociada. La respuesta será siempre la misma.", submit: "Enviar código" },
    recoveryCode: { title: "Introduce el código", pendingTitle: "Tu cuenta está pendiente", code: "Código", verify: "Verificar", continue: "Continuar", resend: "Reenviar código" },
    newPassword: { title: "Crea una contraseña nueva", description: "Introduce y vuelve a confirmar la contraseña.", password: "Contraseña nueva", confirmation: "Confirmar contraseña", submit: "Guardar contraseña" },
  },
  validation: {
    "validation.email.required": "Introduce tu email",
    "validation.email.invalid": "Introduce un email válido",
    "validation.password.required": "Introduce tu contraseña",
    "validation.recoveryCode.invalid": "Introduce el código de seis dígitos",
    "validation.password.minLength": "La contraseña debe tener al menos 8 caracteres",
    "validation.password.confirmationRequired": "Confirma tu contraseña",
    "validation.password.mismatch": "Las contraseñas no coinciden",
    "validation.username.invalid": "Usa entre 3 y 30 letras, números o guiones bajos",
    "validation.birthYear.invalid": "Introduce un año de nacimiento válido",
    "validation.terms.required": "Debes aceptar los términos y la privacidad",
  },
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
  auth: {
    login: { title: "Sign in", email: "Email", password: "Password", submit: "Sign in", submitting: "Signing in…", failed: "Unable to sign in" },
    forgotPassword: { title: "Recover your password", description: "We'll send a code if an account exists. The response is always the same.", submit: "Send code" },
    recoveryCode: { title: "Enter the code", pendingTitle: "Your account is pending", code: "Code", verify: "Verify", continue: "Continue", resend: "Resend code" },
    newPassword: { title: "Create a new password", description: "Enter and confirm your new password.", password: "New password", confirmation: "Confirm password", submit: "Save password" },
  },
  validation: {
    "validation.email.required": "Enter your email",
    "validation.email.invalid": "Enter a valid email",
    "validation.password.required": "Enter your password",
    "validation.recoveryCode.invalid": "Enter the six-digit code",
    "validation.password.minLength": "Password must be at least 8 characters",
    "validation.password.confirmationRequired": "Confirm your password",
    "validation.password.mismatch": "Passwords do not match",
    "validation.username.invalid": "Use 3 to 30 letters, numbers, or underscores",
    "validation.birthYear.invalid": "Enter a valid birth year",
    "validation.terms.required": "You must accept the terms and privacy policy",
  },
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
