import { Badge, EmptyState, Text } from "@proxus/ui"
import { CreatorIcon } from "./icons.js"
import { PaymentRow, Section } from "./shared.js"
import type { CreatorPayment } from "./types.js"

export function CreatorPayments({ payments }: { readonly payments: ReadonlyArray<CreatorPayment> }) {
  const pendingPayments = payments.filter((payment) => payment.status === "Pendiente")
  const paidPayments = payments.filter((payment) => payment.status === "Pagado")

  return (
    <div className="space-y-5 sm:space-y-6">
      <header>
        <Badge variant="primary">Tu actividad</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Pagos</h1>
        <Text className="mt-2 max-w-xl" tone="muted">
          Consulta cuánto has generado y el estado de cada pago.
        </Text>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <Text size="sm" tone="muted" weight="medium">
            Total generado
          </Text>
          <p className="mt-2 text-2xl font-bold text-foreground">605,00 €</p>
          <Text className="mt-1" size="xs" tone="muted">
            En todas tus campañas
          </Text>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <Text size="sm" tone="muted" weight="medium">
            Pendiente
          </Text>
          <p className="mt-2 text-2xl font-bold text-foreground">325,00 €</p>
          <Text className="mt-1" size="xs" tone="muted">
            1 pago en proceso
          </Text>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <Text size="sm" tone="muted" weight="medium">
            Pagado
          </Text>
          <p className="mt-2 text-2xl font-bold text-foreground">280,00 €</p>
          <Text className="mt-1" size="xs" tone="muted">
            Último pago el 5 de agosto
          </Text>
        </div>
      </section>

      {payments.length === 0 ? (
        <EmptyState
          className="bg-white"
          title="Todavía no tienes pagos"
          description="Cuando finalices una campaña, aquí aparecerá el importe y su desglose."
          icon={<CreatorIcon name="wallet" className="size-6" />}
        />
      ) : (
        <>
          {pendingPayments.length === 0 ? null : (
            <Section title="Pendientes" description="El equipo está procesando estos pagos">
              {pendingPayments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
            </Section>
          )}
          {paidPayments.length === 0 ? null : (
            <Section title="Historial" description="Pagos completados">
              {paidPayments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
