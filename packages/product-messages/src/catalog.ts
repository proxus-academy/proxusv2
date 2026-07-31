import { Schema } from "effect"
import i18next, { type i18n } from "i18next"

export const Locale = Schema.Literals(["es", "en"])
export type Locale = typeof Locale.Type

export const fallbackLocale: Locale = "es"
export const localeTags = { es: "es-ES", en: "en-GB" } satisfies Record<Locale, string>
export const isLocale = (value: unknown): value is Locale => value === "es" || value === "en"

const es = {
  language: { label: "Idioma", spanish: "Español", english: "English", device: "Usar idioma del dispositivo" },
  common: { back: "Atrás", retry: "Reintentar", unexpectedError: "Ha ocurrido un error inesperado.", routeError: "No hemos podido abrir esta página" },
  auth: {
    login: { title: "Inicia sesión", email: "Email", password: "Contraseña", submit: "Iniciar sesión", submitting: "Iniciando sesión…", failed: "No se ha podido iniciar sesión", google: "Continuar con Google", createAccount: "Crear una cuenta", forgotPassword: "He olvidado mi contraseña" },
    forgotPassword: { title: "Recupera tu contraseña", description: "Te enviaremos un código si existe una cuenta asociada. La respuesta será siempre la misma.", submit: "Enviar código" },
    recoveryCode: { title: "Introduce el código", pendingTitle: "Tu cuenta está pendiente", code: "Código", verify: "Verificar", continue: "Continuar", resend: "Reenviar código", resendIn: "Reenviar en {{seconds}}s" },
    newPassword: { title: "Crea una contraseña nueva", description: "Introduce y vuelve a confirmar la contraseña.", password: "Contraseña nueva", confirmation: "Confirmar contraseña", submit: "Guardar contraseña" },
    passwordUpdated: { title: "Contraseña actualizada", description: "Ya puedes iniciar sesión con tu contraseña nueva." },
    session: { active: "Tu sesión está activa.", checking: "Comprobando tu sesión…", checkFailed: "No hemos podido comprobar tu sesión", signOut: "Cerrar sesión", signingOut: "Cerrando sesión…" },
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
    progress: "Paso {{current}} de {{total}}",
    longDescription: "Encuentra tu comunidad académica y personaliza tu recorrido en pocos pasos.",
    landingLoading: "Cargando experiencia de registro",
    restart: "Empezar de nuevo",
    home: "Volver al inicio",
    homeShort: "Inicio",
    empty: "No hay opciones disponibles todavía.",
    loading: "Cargando opciones",
    navigation: "Navegación del registro",
    providerGoogle: "Vía Google",
    chooseMethod: { badge: "Tu espacio de estudio con IA", title: "Estudia mejor, a tu manera.", description: "Cuéntanos qué necesitas y qué estudias. Prepararemos Proxus para ti en menos de dos minutos.", longDescription: "Personaliza tu experiencia para encontrar antes los contenidos que necesitas.", google: "Continuar con Google", email: "Empezar con email", login: "Ya tengo cuenta", connectingGoogle: "Conectando con Google…" },
    account: { title: "Crea tu cuenta", description: "Usa un email al que tengas acceso para verificar tu cuenta.", email: "Email", password: "Contraseña", confirmation: "Confirmar contraseña", accept: "Acepto los términos y la privacidad", legal: "Consulta los <terms>términos</terms> y la <privacy>política de privacidad</privacy>.", submit: "Crear cuenta", emailAvailable: "Email disponible.", emailUnavailable: "Ese email ya está registrado." },
    profile: { title: "¿Cómo quieres que te llamemos?", description: "Elige un nombre de usuario único y dinos tu año de nacimiento.", username: "Nombre de usuario", invalidUsername: "Usa entre 3 y 30 letras, números o guiones bajos.", checking: "Comprobando disponibilidad…", available: "Nombre de usuario disponible.", unavailable: "Ese nombre de usuario ya está en uso.", birthYear: "Año de nacimiento", continue: "Continuar" },
    problem: { title: "¿Qué quieres resolver?", description: "Elige tu objetivo principal.", otherTitle: "Cuéntanos qué necesitas", otherDescription: "Describe brevemente qué te gustaría resolver con Proxus.", otherLabel: "Qué quieres resolver", continue: "Continuar", labels: { understandContent: "Entender mejor el contenido", prepareExams: "Preparar exámenes", organizeStudy: "Organizar mi estudio", chooseStudies: "Elegir qué estudiar", other: "Otro" } },
    discovery: { title: "¿Cómo nos conociste?", description: "Tu respuesta nos ayuda a entender qué canales son más útiles.", otherTitle: "¿Dónde nos conociste?", otherDescription: "Cuéntanos brevemente dónde descubriste Proxus.", otherLabel: "Dónde conociste Proxus", continue: "Continuar", sources: { friend: "Amigo o compañero", tiktok: "TikTok", instagram: "Instagram", whatsapp: "WhatsApp", google: "Google", ai: "ChatGPT u otra IA", event: "Evento", other: "Otro" } },
    study: { loading: "Cargando opciones", loadFailed: "No hemos podido cargar las opciones", loadFailedDescription: "Comprueba tu conexión e inténtalo de nuevo.", nonePublished: "No hay opciones publicadas", search: "Buscar opciones", searchPlaceholder: "Buscar…", noResults: "No hay resultados", noResultsDescription: "Prueba con otro término de búsqueda.", users: "{{count, number}} usuarios", currentSelection: "Selección actual", titles: { country: "¿Dónde estudias?", type: "Elige el tipo de estudio", university: "Elige tu universidad", degree: "Elige tus estudios", subject: "Elige una asignatura", root: "¿Qué estudias?", continueFrom: "Continúa desde {{name}}" }, labels: { country: "País", type: "Tipo de estudio", university: "Institución", degree: "Grado", subject: "Asignatura" } },
    verification: { title: "Verifica tu cuenta", sentTo: "Hemos enviado un código a {{email}}.", confirm: "Confirmar código", resend: "Reenviar código", resendIn: "Reenviar en {{seconds}}s", resent: "Te hemos enviado un código nuevo.", spam: "Si no lo encuentras, revisa también la carpeta de spam.", googleTitle: "Confirma tus datos de Google", verifiedEmail: "Email verificado: {{email}}", accept: "Acepto los términos y la privacidad", legal: "Acepto los <terms>términos</terms> y la <privacy>política de privacidad</privacy>.", confirmGoogle: "Confirmar alta" },
    summary: { label: "Resumen del registro", title: "Tu resumen", problem: "Problema", studies: "Estudios", profile: "Perfil", pending: "Pendiente", editProblem: "Editar problema", editStudies: "Editar estudios", editProfile: "Editar perfil" },
    failure: { conflict: "Ese email o nombre de usuario ya está registrado.", invalidCode: "El código es incorrecto o ha caducado.", network: "No hemos podido conectar con el servidor. Revisa tu conexión.", unexpected: "No hemos podido completar la operación. Inténtalo de nuevo." },
    completed: { title: "¡Todo listo!", active: "Tu cuenta está activa." },
    download: { title: "Proxus está diseñado para tu ordenador", description: "Estamos preparando las aplicaciones móviles. Mientras tanto, abre este enlace en una pantalla de al menos 1024 píxeles." },
  },
  errors: { unexpected: "Ha ocurrido un error inesperado.", unavailable: "El servicio no está disponible. Inténtalo de nuevo.", studyCatalog: { nodeNotFound: "No se encontró el elemento solicitado.", edgeNotFound: "No se encontró la relación solicitada." } },
} as const

type ResourceShape<Value> = Value extends string
  ? string
  : { readonly [Key in keyof Value]: ResourceShape<Value[Key]> }

const en = {
  language: { label: "Language", spanish: "Español", english: "English", device: "Use device language" },
  common: { back: "Back", retry: "Retry", unexpectedError: "Something went wrong.", routeError: "We couldn't open this page" },
  auth: {
    login: { title: "Sign in", email: "Email", password: "Password", submit: "Sign in", submitting: "Signing in…", failed: "Unable to sign in", google: "Continue with Google", createAccount: "Create an account", forgotPassword: "I forgot my password" },
    forgotPassword: { title: "Recover your password", description: "We'll send a code if an account exists. The response is always the same.", submit: "Send code" },
    recoveryCode: { title: "Enter the code", pendingTitle: "Your account is pending", code: "Code", verify: "Verify", continue: "Continue", resend: "Resend code", resendIn: "Resend in {{seconds}}s" },
    newPassword: { title: "Create a new password", description: "Enter and confirm your new password.", password: "New password", confirmation: "Confirm password", submit: "Save password" },
    passwordUpdated: { title: "Password updated", description: "You can now sign in with your new password." },
    session: { active: "Your session is active.", checking: "Checking your session…", checkFailed: "We couldn't check your session", signOut: "Sign out", signingOut: "Signing out…" },
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
    progress: "Step {{current}} of {{total}}",
    longDescription: "Find your academic community and personalize your journey in just a few steps.",
    landingLoading: "Loading registration experience",
    restart: "Start again",
    home: "Back to start",
    homeShort: "Start",
    empty: "There are no options available yet.",
    loading: "Loading options",
    navigation: "Registration navigation",
    providerGoogle: "Via Google",
    chooseMethod: { badge: "Your AI study space", title: "Study better, your way.", description: "Tell us what you need and what you study. We'll prepare Proxus for you in under two minutes.", longDescription: "Personalize your experience to find the content you need sooner.", google: "Continue with Google", email: "Start with email", login: "I already have an account", connectingGoogle: "Connecting with Google…" },
    account: { title: "Create your account", description: "Use an email address you can access to verify your account.", email: "Email", password: "Password", confirmation: "Confirm password", accept: "I accept the terms and privacy policy", legal: "Read the <terms>terms</terms> and the <privacy>privacy policy</privacy>.", submit: "Create account", emailAvailable: "Email available.", emailUnavailable: "That email is already registered." },
    profile: { title: "What should we call you?", description: "Choose a unique username and tell us your year of birth.", username: "Username", invalidUsername: "Use 3 to 30 letters, numbers, or underscores.", checking: "Checking availability…", available: "Username available.", unavailable: "That username is already in use.", birthYear: "Year of birth", continue: "Continue" },
    problem: { title: "What do you want to solve?", description: "Choose your main goal.", otherTitle: "Tell us what you need", otherDescription: "Briefly describe what you would like to solve with Proxus.", otherLabel: "What you want to solve", continue: "Continue", labels: { understandContent: "Understand content better", prepareExams: "Prepare for exams", organizeStudy: "Organize my studies", chooseStudies: "Choose what to study", other: "Other" } },
    discovery: { title: "How did you hear about us?", description: "Your answer helps us understand which channels are most useful.", otherTitle: "Where did you hear about us?", otherDescription: "Briefly tell us where you discovered Proxus.", otherLabel: "Where you heard about Proxus", continue: "Continue", sources: { friend: "Friend or classmate", tiktok: "TikTok", instagram: "Instagram", whatsapp: "WhatsApp", google: "Google", ai: "ChatGPT or another AI", event: "Event", other: "Other" } },
    study: { loading: "Loading options", loadFailed: "We couldn't load the options", loadFailedDescription: "Check your connection and try again.", nonePublished: "There are no published options", search: "Search options", searchPlaceholder: "Search…", noResults: "No results", noResultsDescription: "Try another search term.", users: "{{count, number}} users", currentSelection: "Current selection", titles: { country: "Where do you study?", type: "Choose the type of study", university: "Choose your university", degree: "Choose your studies", subject: "Choose a subject", root: "What do you study?", continueFrom: "Continue from {{name}}" }, labels: { country: "Country", type: "Type of study", university: "Institution", degree: "Degree", subject: "Subject" } },
    verification: { title: "Verify your account", sentTo: "We sent a code to {{email}}.", confirm: "Confirm code", resend: "Resend code", resendIn: "Resend in {{seconds}}s", resent: "We've sent you a new code.", spam: "If you can't find it, check your spam folder too.", googleTitle: "Confirm your Google details", verifiedEmail: "Verified email: {{email}}", accept: "I accept the terms and privacy policy", legal: "I accept the <terms>terms</terms> and the <privacy>privacy policy</privacy>.", confirmGoogle: "Confirm registration" },
    summary: { label: "Registration summary", title: "Your summary", problem: "Problem", studies: "Studies", profile: "Profile", pending: "Pending", editProblem: "Edit problem", editStudies: "Edit studies", editProfile: "Edit profile" },
    failure: { conflict: "That email or username is already registered.", invalidCode: "The code is incorrect or has expired.", network: "We couldn't connect to the server. Check your connection.", unexpected: "We couldn't complete the operation. Please try again." },
    completed: { title: "All done!", active: "Your account is active." },
    download: { title: "Proxus is designed for your computer", description: "We're preparing the mobile apps. In the meantime, open this link on a screen at least 1024 pixels wide." },
  },
  errors: { unexpected: "Something went wrong.", unavailable: "The service is unavailable. Please try again.", studyCatalog: { nodeNotFound: "The requested item could not be found.", edgeNotFound: "The requested relationship could not be found." } },
} satisfies ResourceShape<typeof es>

export const resources = { es, en } as const
export type ProductNamespace = keyof typeof es
export type ValidationMessageCode = keyof typeof es.validation
const validationMessageCodes = new Set<string>(Object.keys(es.validation))
export const isValidationMessageCode = (value: string): value is ValidationMessageCode =>
  validationMessageCodes.has(value)

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common"
    returnNull: false
    resources: typeof es
  }
}

export const createProductI18n = (locale: Locale): i18n => {
  const instance = i18next.createInstance()
  void instance.init({
    lng: locale,
    fallbackLng: fallbackLocale,
    supportedLngs: ["es", "en"],
    defaultNS: "common",
    ns: Object.keys(es),
    resources,
    initAsync: false,
    returnNull: false,
    interpolation: { escapeValue: false },
  })
  return instance
}
