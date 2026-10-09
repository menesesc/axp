'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'

/**
 * Edición de un proveedor desde su ficha, con los mismos campos que el alta
 * del listado. Pega contra PATCH /api/proveedores/[id], que es el que valida
 * CUIT y razón social duplicados.
 */

export interface ProveedorEditable {
  id: string
  razonSocial: string
  cuit: string | null
  letra: string | null
  alias: string[]
  email: string | null
  pedidos1Nombre: string | null
  pedidos1Telefono: string | null
  pedidos2Nombre: string | null
  pedidos2Telefono: string | null
  adminNombre: string | null
  adminTelefono: string | null
  diasEntrega: number | null
  cbu: string | null
  activo: boolean
}

type Form = {
  razonSocial: string
  cuit: string
  letra: string
  alias: string
  email: string
  pedidos1Nombre: string
  pedidos1Telefono: string
  pedidos2Nombre: string
  pedidos2Telefono: string
  adminNombre: string
  adminTelefono: string
  diasEntrega: string
  cbu: string
  activo: boolean
}

const desde = (p: ProveedorEditable): Form => ({
  razonSocial: p.razonSocial,
  cuit: p.cuit ?? '',
  letra: p.letra ?? '',
  alias: (p.alias ?? []).join(', '),
  email: p.email ?? '',
  pedidos1Nombre: p.pedidos1Nombre ?? '',
  pedidos1Telefono: p.pedidos1Telefono ?? '',
  pedidos2Nombre: p.pedidos2Nombre ?? '',
  pedidos2Telefono: p.pedidos2Telefono ?? '',
  adminNombre: p.adminNombre ?? '',
  adminTelefono: p.adminTelefono ?? '',
  diasEntrega: p.diasEntrega == null ? '' : String(p.diasEntrega),
  cbu: p.cbu ?? '',
  activo: p.activo,
})

export function EditarProveedorDialog({
  proveedor,
  abierto,
  onCerrar,
}: {
  proveedor: ProveedorEditable
  abierto: boolean
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(() => desde(proveedor))

  // Al reabrir se vuelve a partir de lo guardado, no de lo que quedó tipeado
  // en una edición anterior que se canceló.
  useEffect(() => {
    if (abierto) setForm(desde(proveedor))
  }, [abierto, proveedor])

  const set = (k: keyof Form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const guardar = useMutation({
    mutationFn: async () => {
      const vacio = (s: string) => (s.trim() === '' ? null : s.trim())
      const res = await fetch(`/api/proveedores/${proveedor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocial: form.razonSocial.trim(),
          cuit: vacio(form.cuit.replace(/\D/g, '')),
          letra: form.letra === '' ? null : form.letra,
          alias: form.alias.split(',').map((a) => a.trim()).filter(Boolean),
          email: vacio(form.email),
          pedidos1Nombre: vacio(form.pedidos1Nombre),
          pedidos1Telefono: vacio(form.pedidos1Telefono),
          pedidos2Nombre: vacio(form.pedidos2Nombre),
          pedidos2Telefono: vacio(form.pedidos2Telefono),
          adminNombre: vacio(form.adminNombre),
          adminTelefono: vacio(form.adminTelefono),
          diasEntrega: form.diasEntrega === '' ? null : Number(form.diasEntrega),
          cbu: vacio(form.cbu),
          activo: form.activo,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedor', proveedor.id] })
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success('Proveedor actualizado')
      onCerrar()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar proveedor</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo className="sm:col-span-2" etiqueta="Razón social">
            <Input value={form.razonSocial} onChange={(e) => set('razonSocial')(e.target.value)} />
          </Campo>
          <Campo etiqueta="CUIT">
            <Input value={form.cuit} onChange={(e) => set('cuit')(e.target.value)} placeholder="30123456789" />
          </Campo>
          <Campo etiqueta="Letra">
            <select
              value={form.letra}
              onChange={(e) => set('letra')(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Sin definir</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </Campo>
          <Campo className="sm:col-span-2" etiqueta="Alias (separados por coma)">
            <Input value={form.alias} onChange={(e) => set('alias')(e.target.value)} placeholder="PUELCHE, PUELCHE SA" />
          </Campo>
          <Campo etiqueta="Email">
            <Input value={form.email} onChange={(e) => set('email')(e.target.value)} type="email" />
          </Campo>
          <Campo etiqueta="Días de entrega">
            <Input
              value={form.diasEntrega}
              onChange={(e) => set('diasEntrega')(e.target.value.replace(/\D/g, ''))}
              placeholder="0 = en el día"
            />
          </Campo>

          <p className="sm:col-span-2 border-t border-slate-100 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Contactos
          </p>
          <Campo etiqueta="Pedidos — nombre">
            <Input value={form.pedidos1Nombre} onChange={(e) => set('pedidos1Nombre')(e.target.value)} />
          </Campo>
          <Campo etiqueta="Pedidos — teléfono">
            <Input value={form.pedidos1Telefono} onChange={(e) => set('pedidos1Telefono')(e.target.value)} />
          </Campo>
          <Campo etiqueta="Pedidos 2 — nombre">
            <Input value={form.pedidos2Nombre} onChange={(e) => set('pedidos2Nombre')(e.target.value)} />
          </Campo>
          <Campo etiqueta="Pedidos 2 — teléfono">
            <Input value={form.pedidos2Telefono} onChange={(e) => set('pedidos2Telefono')(e.target.value)} />
          </Campo>
          <Campo etiqueta="Administración — nombre">
            <Input value={form.adminNombre} onChange={(e) => set('adminNombre')(e.target.value)} />
          </Campo>
          <Campo etiqueta="Administración — teléfono">
            <Input value={form.adminTelefono} onChange={(e) => set('adminTelefono')(e.target.value)} />
          </Campo>

          <Campo className="sm:col-span-2" etiqueta="CBU (para transferencias)">
            <Input
              value={form.cbu}
              onChange={(e) => set('cbu')(e.target.value.replace(/\D/g, '').slice(0, 22))}
              placeholder="22 dígitos"
            />
          </Campo>

          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => set('activo')(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Proveedor activo
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || !form.razonSocial.trim()}>
            {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Campo({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{etiqueta}</span>
      {children}
    </label>
  )
}
