'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { KeyRound, Plus, ShieldCheck } from 'lucide-react'

/**
 * Usuarios del POS y la matriz de permisos.
 *
 * Los permisos tienen tres estados y no dos. El del medio —puede, con el PIN
 * de un supervisor— es el caso de todos los días en el salón: el mozo borra
 * un plato que ya fue a cocina y alguien se hace cargo.
 */

const ROLES = [
  ['mozo', 'Mozo / vendedor'],
  ['cajero', 'Cajero'],
  ['supervisor', 'Supervisor'],
  ['admin', 'Admin'],
] as const

const ACCIONES: Array<[string, string, boolean]> = [
  ['borrar_item_enviado', 'Borrar un ítem ya enviado a cocina', false],
  ['cambiar_precio', 'Cambiar el precio en el pedido', false],
  ['descuento_item', 'Descuento sobre un producto', true],
  ['descuento_total', 'Descuento sobre el total', true],
  ['cancelar_precuenta', 'Cancelar la precuenta y reabrir la mesa', false],
  ['venta_sin_comprobante', 'Cobrar sin emitir comprobante', false],
  ['anular_comprobante', 'Anular un comprobante emitido', false],
  ['abrir_caja', 'Abrir la caja', false],
  ['cerrar_caja', 'Cerrar la caja y arquear', false],
  ['retiro_caja', 'Retirar dinero de la caja', true],
]

interface Usuario {
  id: string; codigo: string; nombre: string; rol: string; activo: boolean; tienePin: boolean
}
interface Permiso {
  rol: string; accion: string; permitido: boolean; requiereAutorizacion: boolean; limite: number | null
}

export function UsuariosTab() {
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useState({ codigo: '', nombre: '', rol: 'mozo', pin: '' })
  const [pinDe, setPinDe] = useState<string | null>(null)
  const [pin, setPin] = useState('')

  const { data } = useQuery({
    queryKey: ['pos-usuarios'],
    queryFn: async () => {
      const res = await fetch('/api/pos/usuarios')
      if (!res.ok) throw new Error('No se pudo cargar')
      return res.json() as Promise<{
        usuarios: Usuario[]
        permisos: Permiso[]
        mozosDeCierres: Array<{ codigo: string; nombre: string; ventas: number }>
      }>
    },
  })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['pos-usuarios'] })

  const crear = useMutation({
    mutationFn: async (body: unknown) => {
      const res = await fetch('/api/pos/usuarios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'No se pudo')
      return j
    },
    onSuccess: () => { setNuevo({ codigo: '', nombre: '', rol: 'mozo', pin: '' }); refrescar(); toast.success('Listo') },
    onError: (e: Error) => toast.error(e.message),
  })

  const actualizar = useMutation({
    mutationFn: async (body: unknown) => {
      const res = await fetch('/api/pos/usuarios', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'No se pudo')
    },
    onSuccess: () => { setPinDe(null); setPin(''); refrescar() },
    onError: (e: Error) => toast.error(e.message),
  })

  const permisoDe = (rol: string, accion: string): Permiso =>
    data?.permisos.find((p) => p.rol === rol && p.accion === accion) ??
    { rol, accion, permitido: rol === 'admin', requiereAutorizacion: false, limite: null }

  const ciclar = (rol: string, accion: string) => {
    const p = permisoDe(rol, accion)
    // no puede -> con autorización -> puede solo -> no puede
    const sig = !p.permitido
      ? { permitido: true, requiereAutorizacion: true }
      : p.requiereAutorizacion
        ? { permitido: true, requiereAutorizacion: false }
        : { permitido: false, requiereAutorizacion: false }
    actualizar.mutate({ permisos: [{ rol, accion, ...sig, limite: p.limite }] })
  }

  const usuarios = data?.usuarios ?? []
  const pendientes = data?.mozosDeCierres ?? []

  return (
    <div className="space-y-5">
      {pendientes.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium">
            {pendientes.length} mozos ya aparecen en los cierres de Maxirest y no están cargados
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Se crean con el mismo código, así los informes por mozo no se cortan al cambiar de sistema.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pendientes.slice(0, 12).map((m) => (
              <span key={m.codigo} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {m.codigo} · {m.nombre}
              </span>
            ))}
            {pendientes.length > 12 && <span className="text-xs text-slate-400">y {pendientes.length - 12} más</span>}
          </div>
          <Button size="sm" className="mt-3" onClick={() => crear.mutate({ sembrar: pendientes })} disabled={crear.isPending}>
            Crear los {pendientes.length}
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold">Nuevo usuario</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-24"><span className="mb-1 block text-xs text-slate-500">Código</span>
            <Input value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })} /></label>
          <label className="min-w-[12rem] flex-1"><span className="mb-1 block text-xs text-slate-500">Nombre</span>
            <Input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
          <label className="w-44"><span className="mb-1 block text-xs text-slate-500">Rol</span>
            <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <label className="w-28"><span className="mb-1 block text-xs text-slate-500">PIN</span>
            <Input value={nuevo.pin} onChange={(e) => setNuevo({ ...nuevo, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              placeholder="4 a 6 dígitos" /></label>
          <Button disabled={!nuevo.codigo.trim() || !nuevo.nombre.trim() || crear.isPending}
            onClick={() => crear.mutate(nuevo)}>
            <Plus className="mr-1.5 h-4 w-4" /> Agregar
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2">Código</th><th className="w-full px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Rol</th><th className="px-3 py-2">PIN</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-sm text-slate-400">Sin usuarios.</td></tr>}
            {usuarios.map((u) => (
              <tr key={u.id} className={cn(!u.activo && 'opacity-50')}>
                <td className="px-4 py-2 tabular-nums text-slate-500">{u.codigo}</td>
                <td className="px-3 py-2 font-medium">{u.nombre}</td>
                <td className="px-3 py-2">
                  <select value={u.rol} onChange={(e) => actualizar.mutate({ id: u.id, rol: e.target.value })}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm">
                    {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {pinDe === u.id ? (
                    <span className="flex items-center gap-1">
                      <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="h-8 w-24 text-sm" autoFocus />
                      <Button size="sm" className="h-8" disabled={pin.length < 4}
                        onClick={() => actualizar.mutate({ id: u.id, pin })}>OK</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setPinDe(null); setPin('') }}>✕</Button>
                    </span>
                  ) : (
                    <button onClick={() => setPinDe(u.id)}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 hover:underline">
                      <KeyRound className="h-3 w-3" />
                      {u.tienePin ? 'cambiar' : 'poner PIN'}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => actualizar.mutate({ id: u.id, activo: !u.activo })}
                    className="text-xs text-slate-400 hover:text-slate-900 hover:underline">
                    {u.activo ? 'desactivar' : 'activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-slate-400" /> Permisos</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Tocá cada casilla para cambiarla: <b>no puede</b> → <b className="text-amber-700">con autorización</b> → <b className="text-emerald-700">puede solo</b>.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr><th className="w-full px-4 py-2 text-left">Acción</th>
              {ROLES.map(([v, l]) => <th key={v} className="whitespace-nowrap px-3 py-2">{l}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ACCIONES.map(([accion, label]) => (
              <tr key={accion}>
                <td className="px-4 py-2">{label}</td>
                {ROLES.map(([rol]) => {
                  const p = permisoDe(rol, accion)
                  const estado = !p.permitido ? 'no' : p.requiereAutorizacion ? 'auth' : 'si'
                  return (
                    <td key={rol} className="px-3 py-2 text-center">
                      <button onClick={() => ciclar(rol, accion)}
                        className={cn('rounded-md px-2 py-1 text-[11px] font-semibold',
                          estado === 'si' && 'bg-emerald-100 text-emerald-800',
                          estado === 'auth' && 'bg-amber-100 text-amber-800',
                          estado === 'no' && 'bg-slate-100 text-slate-400')}>
                        {estado === 'si' ? 'sí' : estado === 'auth' ? 'c/ aut.' : 'no'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
