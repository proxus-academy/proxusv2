import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Progress,
  Text,
} from "@proxus/ui"
import { CreatorIcon } from "./icons.js"
import { Section } from "./shared.js"

function ReadonlyField({
  id,
  label,
  value,
  description,
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly description?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldControl>
        <Input id={id} value={value} readOnly className="h-11 bg-muted/40" />
      </FieldControl>
      {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

export function CreatorProfile() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <header>
        <Badge variant="primary">Tu cuenta</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Mi perfil</h1>
        <Text className="mt-2 max-w-xl" tone="muted">
          Mantén tus datos actualizados para recibir campañas compatibles contigo.
        </Text>
      </header>

      <section className="rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/[0.08] to-secondary/[0.05] p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-primary to-secondary text-xl font-bold text-white shadow-sm">
            LR
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">Lucía Romero</h2>
              <Badge variant="success" icon={<CreatorIcon name="check" className="size-3" />}>
                Perfil verificado
              </Badge>
            </div>
            <Text className="mt-1" size="sm" tone="muted">
              @luciaromero · España · Tier 2
            </Text>
            <div className="mt-4 flex items-center gap-3">
              <Progress value={90} className="max-w-xs" aria-label="Perfil completado al 90%" />
              <Text size="sm" weight="semibold">
                90%
              </Text>
            </div>
          </div>
        </div>
      </section>

      <Section
        title="Datos personales"
        description="Estos datos se utilizan para contratos y comunicaciones"
        action={<Button variant="outline" size="sm">Editar</Button>}
      >
        <div className="grid gap-5 pt-2 sm:grid-cols-2">
          <ReadonlyField id="creator-name" label="Nombre completo" value="Lucía Romero García" />
          <ReadonlyField id="creator-email" label="Email" value="lucia@ejemplo.com" description="Email verificado" />
          <ReadonlyField id="creator-phone" label="Teléfono" value="+34 612 345 678" />
          <ReadonlyField id="creator-country" label="País" value="España" />
          <ReadonlyField id="creator-languages" label="Idiomas" value="Español, inglés" />
          <ReadonlyField id="creator-availability" label="Disponibilidad" value="Disponible para campañas" />
        </div>
      </Section>

      <Section
        title="Redes sociales"
        description="Cuentas utilizadas para publicar contenido"
        action={<Button variant="outline" size="sm">Gestionar</Button>}
      >
        <div className="divide-y divide-border">
          <div className="flex items-center gap-4 py-4 first:pt-1">
            <span className="flex size-11 items-center justify-center rounded-xl bg-gray-950 font-bold text-white">TT</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">@luciaromero</p>
              <p className="mt-0.5 text-sm text-muted-foreground">TikTok · 24,8 mil seguidores</p>
            </div>
            <Badge variant="success">Verificada</Badge>
          </div>
          <div className="flex items-center gap-4 py-4 last:pb-1">
            <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-pink-500 to-orange-400 font-bold text-white">IG</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">@luciaromero</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Instagram · 18,2 mil seguidores</p>
            </div>
            <Badge variant="success">Verificada</Badge>
          </div>
        </div>
      </Section>

      <Section
        title="Cobros y documentos"
        description="Información necesaria para procesar tus pagos"
        action={<Button variant="outline" size="sm">Actualizar</Button>}
      >
        <div className="divide-y divide-border">
          <div className="flex items-center gap-3 py-4 first:pt-1">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CreatorIcon name="check" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Datos de cobro</p>
              <p className="text-sm text-muted-foreground">Cuenta terminada en 4821</p>
            </div>
            <Badge variant="success">Completos</Badge>
          </div>
          <div className="flex items-center gap-3 py-4 last:pb-1">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CreatorIcon name="check" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Acuerdo de colaboración</p>
              <p className="text-sm text-muted-foreground">Firmado el 21 de agosto de 2026</p>
            </div>
            <Button size="sm" variant="ghost">Ver</Button>
          </div>
        </div>
      </Section>
    </div>
  )
}
