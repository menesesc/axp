'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CONDICIONES_IVA } from '@/lib/eventos/constantes'
import type { ClienteEvento } from '@/lib/eventos/db'
import { Campo, SelectSimple, avisarError, claseSelect, claseTextarea, enviar } from './comunes'

export type { ClienteEvento }

export function useClientesEventos(habilitado = true) {
  return useQuery({
    queryKey: ['eventos-clientes'],
    queryFn: async () => {
      const res = await fetch('/api/eventos/clientes')
      if (!res.ok) throw new Error('No se pudieron cargar los clientes')
      return res.json() as Promise<{ clientes: ClienteEvento[] }>
    },
    enabled: habilitado,
    staleTime: 60 * 1000,
  })
}

const VACIO = { tipo: 'PARTICULAR', nombre: '', cuit: '', condicionIva: 'CF', telefono: '', email: '', comisionPct: '', notas: '' }

/** Alta y edición de un cliente (particular o agencia). */
export function ClienteDialog({
  abierto,
  onCerrar,
  cliente,
  onGuardado,
}: {
  abierto: boolean
  onCerrar: () => void
  cliente?: ClienteEvento | null
  onGuardado?: (id: string) => void
}) {
  const qc = useQueryClient()
  const [f, setF] = useState({ ...VACIO })

  useEffect(() => {
    if (!abierto) return
    setF(
      cliente
        ? {
            tipo: cliente.tipo,
            nombre: cliente.nombre,
            cuit: cliente.cuit ?? '',
            condicionIva: cliente.condicionIva,
            telefono: cliente.telefono ?? '',
            email: cliente.email ?? '',
            comisionPct: cliente.comisionPct ? String(cliente.comisionPct) : '',
            notas: cliente.notas ?? '',
          }
        : { ...VACIO }
    )
  }, [abierto, cliente])

  const guardar = useMutation({
    mutationFn: () => enviar('/api/eventos/clientes', cliente ? 'PATCH' : 'POST', { ...(cliente ? { id: cliente.id } : {}), ...f }),
    onSuccess: (r: { id?: string }) => {
      qc.invalidateQueries({ queryKey: ['eventos-clientes'] })
      toast.success(cliente ? 'Cliente actualizado' : 'Cliente creado')
      onGuardado?.(r.id ?? cliente?.id ?? '')
      onCerrar()
    },
    onError: avisarError,
  })

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            guardar.mutate()
          }}
        >
          <Campo etiqueta="Tipo">
            <SelectSimple value={f.tipo} onChange={set('tipo')} opciones={[{ valor: 'PARTICULAR', texto: 'Particular' }, { valor: 'AGENCIA', texto: 'Agencia' }]} />
          </Campo>
          <Campo etiqueta="Condición de IVA">
            <SelectSimple value={f.condicionIva} onChange={set('condicionIva')} opciones={CONDICIONES_IVA} />
          </Campo>
          <Campo etiqueta="Nombre o razón social" className="sm:col-span-2">
            <Input value={f.nombre} onChange={(e) => set('nombre')(e.target.value)} autoFocus placeholder="A nombre de quién sale la factura" />
          </Campo>
          <Campo etiqueta="CUIT / CUIL">
            <Input value={f.cuit} onChange={(e) => set('cuit')(e.target.value)} inputMode="numeric" placeholder="30-12345678-9" />
          </Campo>
          <Campo etiqueta="Comisión %" ayuda={f.tipo === 'AGENCIA' ? 'Lo que se lleva la agencia' : 'Normalmente 0'}>
            <Input value={f.comisionPct} onChange={(e) => set('comisionPct')(e.target.value)} inputMode="decimal" placeholder="0" />
          </Campo>
          <Campo etiqueta="Teléfono">
            <Input value={f.telefono} onChange={(e) => set('telefono')(e.target.value)} inputMode="tel" />
          </Campo>
          <Campo etiqueta="Email">
            <Input value={f.email} onChange={(e) => set('email')(e.target.value)} type="email" />
          </Campo>
          <Campo etiqueta="Notas" className="sm:col-span-2">
            <textarea value={f.notas} onChange={(e) => set('notas')(e.target.value)} className={claseTextarea} />
          </Campo>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending || !f.nombre.trim()}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Select del cliente de una reserva, con alta en el momento. */
export function SelectorCliente({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useClientesEventos()
  const [nuevo, setNuevo] = useState(false)
  const clientes = (data?.clientes ?? []).filter((c) => c.activo || c.id === value)
  return (
    <div className="flex gap-2">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={claseSelect}>
        <option value="">Sin cliente</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.tipo === 'AGENCIA' ? ' (agencia)' : ''}
          </option>
        ))}
      </select>
      <Button type="button" variant="outline" size="icon" onClick={() => setNuevo(true)} title="Nuevo cliente" className="shrink-0">
        <Plus className="h-4 w-4" />
      </Button>
      <ClienteDialog abierto={nuevo} onCerrar={() => setNuevo(false)} onGuardado={(id) => id && onChange(id)} />
    </div>
  )
}
