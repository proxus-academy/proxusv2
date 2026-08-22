import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
} from "@proxus/ui"
import { useState } from "react"
import { CreatorIcon } from "./icons.js"

export function UploadVideoDialog({
  open,
  onOpenChange,
  onSubmitted,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmitted: () => void
}) {
  const [ownContent, setOwnContent] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Subir un vídeo</DialogTitle>
          <DialogDescription>
            Cada contenido incluye una publicación en TikTok y otra en Instagram.
          </DialogDescription>
        </DialogHeader>
        <form
          id="upload-video-form"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmitted()
          }}
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-primary/15 bg-primary/[0.05] p-4 text-sm text-foreground">
              <p className="font-semibold">Publica primero, registra después</p>
              <p className="mt-1 text-muted-foreground">
                Comprobaremos que ambas publicaciones pertenecen a tus cuentas y obtendremos sus views automáticamente.
              </p>
            </div>
            <Field>
              <FieldLabel htmlFor="video-format">Formato</FieldLabel>
              <FieldControl>
                <select
                  id="video-format"
                  aria-label="Formato"
                  defaultValue=""
                  required
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="" disabled>Selecciona un formato</option>
                  <option value="routine">Rutina</option>
                  <option value="before-after">Antes y después</option>
                  <option value="review">Review</option>
                </select>
              </FieldControl>
            </Field>
            <Field>
              <FieldLabel htmlFor="video-published-at">Fecha de publicación</FieldLabel>
              <FieldControl>
                <Input id="video-published-at" type="date" defaultValue="2026-08-29" required />
              </FieldControl>
              <FieldDescription>Debe estar dentro de las fechas de la campaña.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="video-primary-url">Enlace de TikTok</FieldLabel>
              <FieldControl>
                <Input id="video-primary-url" type="url" placeholder="https://tiktok.com/..." required />
              </FieldControl>
            </Field>
            <Field>
              <FieldLabel htmlFor="video-secondary-url">Enlace de Instagram</FieldLabel>
              <FieldControl>
                <Input id="video-secondary-url" type="url" placeholder="https://instagram.com/reel/..." required />
              </FieldControl>
            </Field>
            <Field>
              <FieldLabel htmlFor="video-reference">Referencia</FieldLabel>
              <FieldControl>
                <Input
                  id="video-reference"
                  placeholder="Ej. GLW8"
                  disabled={ownContent}
                  required={!ownContent}
                />
              </FieldControl>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={ownContent}
                  onChange={(event) => setOwnContent(event.currentTarget.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                Es contenido propio y no utiliza una referencia
              </label>
              <FieldDescription>El código permite atribuir las conversiones al contenido.</FieldDescription>
            </Field>
          </div>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            type="submit"
            form="upload-video-form"
            icon={<CreatorIcon name="upload" className="size-5" />}
          >
            Registrar vídeo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const meetingSlots = ["Lun 24 · 11:30", "Lun 24 · 16:00", "Mar 25 · 10:00", "Mar 25 · 17:30"]

export function MeetingDialog({
  open,
  onOpenChange,
  onReserved,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onReserved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Reserva tu reunión</DialogTitle>
          <DialogDescription>
            Todos los horarios se muestran en hora peninsular española. La reunión dura 30 minutos.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            {meetingSlots.map((slot, index) => (
              <label
                key={slot}
                className="cursor-pointer rounded-xl border-2 border-border bg-white p-4 text-sm font-semibold transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06]"
              >
                <input type="radio" name="meeting-slot" value={slot} defaultChecked={index === 0} className="sr-only" />
                <CreatorIcon name="calendar" className="mb-3 size-5 text-primary" />
                {slot}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button onClick={onReserved}>Confirmar reserva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
