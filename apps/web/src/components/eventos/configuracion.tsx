'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ItemCatalogo } from '@/lib/eventos/db'
import { cn } from '@/lib/utils'
import { Campo, avisarError, claseTextarea, enviar, useCatalogos } from './comunes'

/**
 * Lo que cada casa ajusta: de dónde llegan las reservas, qué tipos de evento
 * hace, y desde cuándo avisar. Desactivar un origen no lo borra: las
 * reservas viejas siguen diciendo de dónde vinieron.
 */
export function ConfiguracionDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const qc = useQueryClient()
  const { origenes, tipos, configuracion } = useCatalogos()
  const [cfg, setCfg] = useState({ diasPresupuesto: '7', diasAvisoVencimiento: '3', avisoCupoPct: '90' })
  const [presu, setPresu] = useState({ nombreCasa: '', pie: '', validezDias: '' })
  useEffect(() => {
    if (!configuracion) return
    setCfg({
      diasPresupuesto: String(configuracion.diasPresupuesto),
      diasAvisoVencimiento: String(configuracion.diasAvisoVencimiento),
      avisoCupoPct: String(configuracion.avisoCupoPct),
    })
    setPresu({
      nombreCasa: configuracion.nombreCasa ?? '',
      pie: configuracion.presupuestoPie ?? '',
      validezDias: configuracion.presupuestoValidezDias ? String(configuracion.presupuestoValidezDias) : '',
    })
  }, [configuracion])
  const guardarPresu = useMutation({
    mutationFn: () => enviar('/api/eventos/catalogos', 'PATCH', { presupuesto: presu }),
    onSuccess: () => {
      toast.success('Datos del presupuesto guardados')
      refrescar()
    },
    onError: avisarError,
  })

  const refrescar = () => qc.invalidateQueries({ queryKey: ['eventos-catalogos'] })
  const guardarCfg = useMutation({
    mutationFn: () => enviar('/api/eventos/catalogos', 'PATCH', { configuracion: cfg }),
    onSuccess: () => {
      toast.success('Avisos guardados')
      refrescar()
    },
    onError: avisarError,
  })

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Eventos: orígenes, tipos, avisos y presupuesto</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          <Lista titulo="Orígenes de reserva" lista="ORIGEN" items={origenes} onCambio={refrescar} />
          <Lista titulo="Tipos de evento" lista="TIPO_EVENTO" items={tipos} onCambio={refrescar} conColor />
        </div>
        <form
          className="grid gap-3 rounded-xl bg-slate-900/[0.03] p-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault()
            guardarCfg.mutate()
          }}
        >
          <p className="text-sm font-medium sm:col-span-4">Alertas</p>
          <Campo etiqueta="Presupuesto sin respuesta" ayuda="días">
            <Input value={cfg.diasPresupuesto} onChange={(e) => setCfg((x) => ({ ...x, diasPresupuesto: e.target.value }))} inputMode="numeric" />
          </Campo>
          <Campo etiqueta="Avisar cuota antes" ayuda="días">
            <Input value={cfg.diasAvisoVencimiento} onChange={(e) => setCfg((x) => ({ ...x, diasAvisoVencimiento: e.target.value }))} inputMode="numeric" />
          </Campo>
          <Campo etiqueta="Cupo casi lleno" ayuda="% ocupado">
            <Input value={cfg.avisoCupoPct} onChange={(e) => setCfg((x) => ({ ...x, avisoCupoPct: e.target.value }))} inputMode="numeric" />
          </Campo>
          <Button type="submit" className="self-start sm:mt-5" disabled={guardarCfg.isPending}>
            Guardar
          </Button>
        </form>
        <form
          className="grid gap-3 rounded-xl bg-slate-900/[0.03] p-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault()
            guardarPresu.mutate()
          }}
        >
          <p className="text-sm font-medium sm:col-span-4">Presupuesto</p>
          <Campo etiqueta="Nombre de la casa" className="sm:col-span-3" ayuda="Cómo se presenta en el encabezado. Vacío = la razón social. El logo es el de Configuración → Empresa.">
            <Input value={presu.nombreCasa} onChange={(e) => setPresu((x) => ({ ...x, nombreCasa: e.target.value }))} />
          </Campo>
          <Campo etiqueta="Validez" ayuda="días (vacío = no se dice)">
            <Input value={presu.validezDias} onChange={(e) => setPresu((x) => ({ ...x, validezDias: e.target.value }))} inputMode="numeric" />
          </Campo>
          <Campo etiqueta="Pie de todos los presupuestos" className="sm:col-span-4" ayuda="Formas de pago, qué incluye, política de cancelación…">
            <textarea value={presu.pie} onChange={(e) => setPresu((x) => ({ ...x, pie: e.target.value }))} className={claseTextarea} />
          </Campo>
          <div className="flex justify-end sm:col-span-4">
            <Button type="submit" disabled={guardarPresu.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Lista({
  titulo,
  lista,
  items,
  onCambio,
  conColor,
}: {
  titulo: string
  lista: 'ORIGEN' | 'TIPO_EVENTO'
  items: ItemCatalogo[]
  onCambio: () => void
  conColor?: boolean
}) {
  const [nombre, setNombre] = useState('')
  const agregar = useMutation({
    mutationFn: () => enviar('/api/eventos/catalogos', 'POST', { lista, nombre, color: conColor ? '#64748b' : null }),
    onSuccess: () => {
      setNombre('')
      onCambio()
    },
    onError: avisarError,
  })
  const cambiar = useMutation({
    mutationFn: (cuerpo: Record<string, unknown>) => enviar('/api/eventos/catalogos', 'PATCH', cuerpo),
    onSuccess: onCambio,
    onError: avisarError,
  })
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{titulo}</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className={cn('flex items-center gap-2 text-sm', !i.activo && 'opacity-50')}>
            {conColor && (
              <input
                type="color"
                value={i.color ?? '#64748b'}
                onChange={(e) => cambiar.mutate({ id: i.id, color: e.target.value })}
                className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label={`Color de ${i.nombre}`}
              />
            )}
            <span className={cn('flex-1', !i.activo && 'line-through')}>{i.nombre}</span>
            <button type="button" className="text-xs text-[var(--azul-2)] hover:underline" onClick={() => cambiar.mutate({ id: i.id, activo: !i.activo })}>
              {i.activo ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (nombre.trim()) agregar.mutate()
        }}
      >
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Agregar…" className="h-8" />
        <Button type="submit" size="sm" variant="outline" disabled={!nombre.trim()}>
          +
        </Button>
      </form>
    </div>
  )
}
