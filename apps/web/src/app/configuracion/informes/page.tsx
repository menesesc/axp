'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUser } from '@/hooks/use-user'
import { toast } from 'sonner'
import {
  Plus,
  Send,
  Trash2,
  Edit,
  Loader2,
  MailPlus,
  X,
  Calendar,
  Clock,
} from 'lucide-react'

type Frecuencia = 'DIARIA' | 'SEMANAL' | 'MENSUAL'

interface Recipient {
  id?: string
  email: string
  nombre: string | null
}

interface Subscription {
  id: string
  nombre: string
  frecuencia: Frecuencia
  diaSemana: number | null
  diaMes: number | null
  hora: string
  tz: string
  sucursal: string | null
  topN: number
  activo: boolean
  recipients: Array<{ id: string; email: string; nombre: string | null; usuarioId: string | null }>
  createdAt: string
  updatedAt: string
  lastRun: { ejecutadoEn: string; status: 'OK' | 'FAIL' | 'SKIP' } | null
}

const DOW_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export default function InformesConfigPage() {
  const { isAdmin } = useUser()
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery<{ subscriptions: Subscription[] }>({
    queryKey: ['informes-subscriptions'],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/informes/ventas')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: isAdmin,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/configuracion/informes/ventas/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error eliminando')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['informes-subscriptions'] })
      toast.success('Subscripción eliminada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/configuracion/informes/ventas/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Error')
      return body as { status: 'OK' | 'SKIP'; destinatariosCount: number; range: { from: string; to: string } }
    },
    onSuccess: (data) => {
      if (data.status === 'SKIP') {
        toast.info(`Sin ventas para ${data.range.from}. Se envió igual a ${data.destinatariosCount} destinatarios.`)
      } else {
        toast.success(`Mail de prueba enviado a ${data.destinatariosCount} destinatario${data.destinatariosCount === 1 ? '' : 's'}`)
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-slate-500">
          No tienes permisos para acceder a esta sección
        </div>
      </DashboardLayout>
    )
  }

  const subs = data?.subscriptions ?? []
  const editing = editingId ? subs.find((s) => s.id === editingId) ?? null : null

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-4xl">
        <Header
          title="Informes por mail"
          description="Configurá envíos automáticos de informes de ventas a uno o varios destinatarios."
          actions={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nueva subscripción
            </Button>
          }
        />

        {isLoading ? (
          <div className="text-center py-12 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : subs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
            <MailPlus className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium mb-1">Sin subscripciones aún</p>
            <p className="text-slate-500 text-sm mb-4">
              Configurá un envío diario/semanal/mensual de informes a tu equipo o contadora.
            </p>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Crear primera subscripción
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {subs.map((s) => (
              <SubscriptionCard
                key={s.id}
                sub={s}
                onEdit={() => setEditingId(s.id)}
                onDelete={() => {
                  if (confirm(`¿Eliminar la subscripción "${s.nombre}"?`)) {
                    deleteMutation.mutate(s.id)
                  }
                }}
                onTest={() => testMutation.mutate(s.id)}
                testing={testMutation.isPending && testMutation.variables === s.id}
              />
            ))}
          </div>
        )}
      </div>

      <SubscriptionDialog
        open={creating || !!editing}
        onClose={() => {
          setCreating(false)
          setEditingId(null)
        }}
        initial={editing}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['informes-subscriptions'] })
          setCreating(false)
          setEditingId(null)
        }}
      />
    </DashboardLayout>
  )
}

function SubscriptionCard({
  sub,
  onEdit,
  onDelete,
  onTest,
  testing,
}: {
  sub: Subscription
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
  testing: boolean
}) {
  const frecLabel =
    sub.frecuencia === 'DIARIA'
      ? 'Diario'
      : sub.frecuencia === 'SEMANAL'
      ? `Semanal · ${DOW_LABELS[(sub.diaSemana ?? 1) - 1] ?? '?'}`
      : `Mensual · día ${sub.diaMes ?? '?'}`

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900">{sub.nombre}</h3>
            {!sub.activo && (
              <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                pausada
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {frecLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {sub.hora} hs
            </span>
            <span>
              {sub.sucursal ? `Sucursal ${sub.sucursal}` : 'Todas las sucursales'}
            </span>
            <span>Top {sub.topN} por rubro</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {sub.recipients.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs"
              >
                {r.email}
                {r.usuarioId == null && (
                  <span className="text-[10px] text-amber-700" title="Email externo: recibirá el mail pero sin acceso a la vista web">
                    (externo)
                  </span>
                )}
              </span>
            ))}
          </div>
          {sub.lastRun && (
            <p className="mt-3 text-xs text-slate-400">
              Último envío:{' '}
              <span className={statusColor(sub.lastRun.status)}>
                {sub.lastRun.status}
              </span>{' '}
              · {new Date(sub.lastRun.ejecutadoEn).toLocaleString('es-AR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Probar
          </Button>
          <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} title="Eliminar">
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function statusColor(s: 'OK' | 'FAIL' | 'SKIP'): string {
  if (s === 'OK') return 'text-emerald-600 font-medium'
  if (s === 'SKIP') return 'text-amber-600 font-medium'
  return 'text-red-600 font-medium'
}

function SubscriptionDialog({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initial: Subscription | null
  onSaved: () => void
}) {
  const isEdit = !!initial
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(initial?.frecuencia ?? 'DIARIA')
  const [diaSemana, setDiaSemana] = useState<number>(initial?.diaSemana ?? 1)
  const [diaMes, setDiaMes] = useState<number>(initial?.diaMes ?? 1)
  const [hora, setHora] = useState(initial?.hora ?? '07:00')
  const [sucursal, setSucursal] = useState(initial?.sucursal ?? '')
  const [topN, setTopN] = useState<number>(initial?.topN ?? 10)
  const [activo, setActivo] = useState(initial?.activo ?? true)
  const [recipients, setRecipients] = useState<Recipient[]>(
    initial?.recipients.map((r) => ({ email: r.email, nombre: r.nombre })) ?? []
  )
  const [emailInput, setEmailInput] = useState('')
  const [nombreInput, setNombreInput] = useState('')

  // Reset cuando cambia el initial (al abrir el dialog).
  // El dialog desmonta al cerrar (key implícita); para edición pasamos initial
  // distinto cada vez así que el useState lee el inicial OK.

  function addRecipient() {
    const e = emailInput.trim().toLowerCase()
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      toast.error('Email inválido')
      return
    }
    if (recipients.some((r) => r.email === e)) {
      toast.error('Ya está en la lista')
      return
    }
    setRecipients([...recipients, { email: e, nombre: nombreInput.trim() || null }])
    setEmailInput('')
    setNombreInput('')
  }

  function removeRecipient(email: string) {
    setRecipients(recipients.filter((r) => r.email !== email))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!nombre.trim()) throw new Error('Nombre requerido')
      if (recipients.length === 0) throw new Error('Al menos un destinatario')

      const payload = {
        nombre: nombre.trim(),
        frecuencia,
        diaSemana: frecuencia === 'SEMANAL' ? diaSemana : null,
        diaMes: frecuencia === 'MENSUAL' ? diaMes : null,
        hora,
        tz: 'America/Argentina/Buenos_Aires',
        sucursal: sucursal.trim() || null,
        topN,
        activo,
        recipients: recipients.map((r) => ({ email: r.email, nombre: r.nombre })),
      }
      const url = isEdit
        ? `/api/configuracion/informes/ventas/${initial!.id}`
        : '/api/configuracion/informes/ventas'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Error guardando')
      return body
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Subscripción actualizada' : 'Subscripción creada')
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar subscripción' : 'Nueva subscripción'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Nombre</Label>
              <Input
                placeholder="ej. Resumen diario gerencia"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div>
              <Label>Sucursal (opcional)</Label>
              <Input
                placeholder="vacío = todas"
                value={sucursal}
                onChange={(e) => setSucursal(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Frecuencia</Label>
            <div className="mt-1 inline-flex bg-slate-100 rounded-md p-0.5">
              {(['DIARIA', 'SEMANAL', 'MENSUAL'] as Frecuencia[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrecuencia(f)}
                  className={`px-3 py-1.5 text-sm rounded ${
                    frecuencia === f ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                  }`}
                >
                  {f === 'DIARIA' ? 'Diario' : f === 'SEMANAL' ? 'Semanal' : 'Mensual'}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {frecuencia === 'DIARIA' && 'Cada día se envía el informe del día anterior.'}
              {frecuencia === 'SEMANAL' && 'Cada semana se envía el informe de la semana anterior (lun-dom).'}
              {frecuencia === 'MENSUAL' && 'Cada mes se envía el informe del mes anterior completo.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {frecuencia === 'SEMANAL' && (
              <div>
                <Label>Día de envío</Label>
                <select
                  value={diaSemana}
                  onChange={(e) => setDiaSemana(parseInt(e.target.value, 10))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  {DOW_LABELS.map((l, i) => (
                    <option key={i + 1} value={i + 1}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {frecuencia === 'MENSUAL' && (
              <div>
                <Label>Día del mes</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={diaMes}
                  onChange={(e) => setDiaMes(parseInt(e.target.value, 10) || 1)}
                />
                <p className="text-[11px] text-slate-400 mt-1">Si pasa de 28, se ajusta al último día del mes.</p>
              </div>
            )}
            <div>
              <Label>Hora</Label>
              <Input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
            <div>
              <Label>Top N por rubro</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={topN}
                onChange={(e) => setTopN(parseInt(e.target.value, 10) || 10)}
              />
            </div>
          </div>

          <div>
            <Label>Destinatarios</Label>
            <p className="text-xs text-slate-500 mb-2">
              Si el email no es usuario de la empresa, lo invitamos automáticamente como <strong>visor</strong> (solo lectura).
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[2rem]">
              {recipients.length === 0 ? (
                <span className="text-xs text-slate-400">Aún no hay destinatarios</span>
              ) : (
                recipients.map((r) => (
                  <span
                    key={r.email}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs"
                  >
                    {r.email}
                    {r.nombre && <span className="text-indigo-500">({r.nombre})</span>}
                    <button
                      type="button"
                      onClick={() => removeRecipient(r.email)}
                      className="hover:bg-indigo-100 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="email@ejemplo.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addRecipient()
                  }
                }}
                className="flex-1 min-w-[180px]"
              />
              <Input
                placeholder="nombre (opcional)"
                value={nombreInput}
                onChange={(e) => setNombreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addRecipient()
                  }
                }}
                className="w-44"
              />
              <Button type="button" variant="outline" onClick={addRecipient}>
                Agregar
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="activo"
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="activo" className="text-sm text-slate-700">
              Activa (envía automáticamente)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear subscripción'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
