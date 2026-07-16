import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Heading,
  Input,
  Stat,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text
} from "@proxus/ui"
import { Flame, Sparkles } from "lucide-react"
import { useState } from "react"

const CARRERAS = [
  { value: "medicina", label: "Medicina" },
  { value: "derecho", label: "Derecho" },
  { value: "enfermeria", label: "Enfermería" }
]

export function App() {
  const [notifications, setNotifications] = useState(true)
  const [carrera, setCarrera] = useState<string | null>("medicina")

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <div>
        <Heading level={1}>Proxus v2 — Design System</Heading>
        <Text tone="muted" className="mt-1">
          Vista previa de los primitivos de @proxus/ui.
        </Text>
      </div>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Botones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="soft">Soft</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="primary" loading>
            Cargando
          </Button>
        </CardContent>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Badges &amp; chips</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant="primary">Nuevo</Badge>
          <Badge variant="success">Activo</Badge>
          <Badge variant="warning">Pendiente</Badge>
          <Badge variant="danger">Error</Badge>
          <Chip variant="gold" icon={<Sparkles className="h-4 w-4" />}>
            SuperMagIA
          </Chip>
          <Chip variant="primary" icon={<Flame className="h-4 w-4" />}>
            7 días
          </Chip>
        </CardContent>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Estadísticas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Stat title="Tests" value={128} trend={{ value: 12, isPositive: true }} />
          <Stat title="Racha" value="7 días" description="Récord: 21 días" />
        </CardContent>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Formulario</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input placeholder="tu@email.com" />
          <Combobox options={CARRERAS} value={carrera} onChange={setCarrera} />
          <div className="flex items-center gap-3">
            <Switch checked={notifications} onCheckedChange={setNotifications} id="notif" />
            <Text as="span" size="sm">
              Notificaciones activadas
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <Avatar name="Javier" color="#793ef9" size="sm" />
            <Avatar name="Ana" color="#9900a1" size="sm" />
          </div>
        </CardContent>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Tabs &amp; diálogo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs defaultValue="resumen">
            <TabsList>
              <TabsTrigger value="resumen">Resumen</TabsTrigger>
              <TabsTrigger value="detalle">Detalle</TabsTrigger>
            </TabsList>
            <TabsContent value="resumen">
              <Text tone="muted">Vista resumida del progreso.</Text>
            </TabsContent>
            <TabsContent value="detalle">
              <Text tone="muted">Vista detallada del progreso.</Text>
            </TabsContent>
          </Tabs>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Abrir diálogo</Button>
            </DialogTrigger>
            <DialogContent size="md">
              <DialogHeader>
                <DialogTitle>Confirmar acción</DialogTitle>
                <DialogDescription>Este es un ejemplo del Dialog responsive del design system.</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </main>
  )
}
