'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Search, User } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { pesos } from '@/components/dashboard/inicio'
import { Button } from '@/components/ui/button'
import { ClienteDialog, useClientesEventos, type ClienteEvento } from '@/components/eventos/clientes'
import { avisarError, enviar } from '@/components/eventos/comunes'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { CONDICIONES_IVA, fechaCorta } from '@/lib/eventos/constantes'
import { cn } from '@/lib/utils'

/**
 * Clientes de eventos: particulares y agencias, con lo que llevan reservado.
 * Se cargan una vez y se eligen en cada reserva.
 */
export default function ClientesEventos() {
  const qc = useQueryClient()
  const { canEdit, canSeeImportes } = useUser()
  const puedeEditar = canEdit(SECCION.EVENTOS_RESERVAS)
  const verImportes = canSeeImportes(SECCION.EVENTOS_RESERVAS)
  const { data, isLoading } = useClientesEventos()
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<'' | 'PARTICULAR' | 'AGENCIA'>('')
  const [editando, setEditando] = useState<ClienteEvento | null>(null)
  const [nuevo, setNuevo] = useState(false)

  const alternar = useMutation({
    mutationFn: (c: ClienteEvento) => enviar('/api/eventos/clientes', 'PATCH', { id: c.id, activo: !c.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos-clientes'] }),
    onError: avisarError,
  })

  const clientes = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (data?.clientes ?? []).filter(
      (c) =>
        (!tipo || c.tipo === tipo) &&
        (!t || c.nombre.toLowerCase().includes(t) || (c.cuit ?? '').includes(t.replace(/\D/g, '') || '~') || (c.telefono ?? '').includes(t) || (c.email ?? '').toLowerCase().includes(t))
    )
  }, [data, q, tipo])

  return (
    <DashboardLayout>
      <Header
        title="Clientes de eventos"
        description="Particulares y agencias. Las facturas salen a su nombre."
        actions={
          puedeEditar ? (
            <Button className="gap-1.5" onClick={() => setNuevo(true)}>
              <Plus className="h-4 w-4" />
              Cliente
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex h-10 min-w-[14rem] flex-1 items-center sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, CUIT, teléfono, email"
            className="h-10 w-full rounded-xl border border-slate-900/[0.12] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#3b9bff] focus:ring-4 focus:ring-[#3b9bff]/15"
          />
        </label>
        <div className="inline-flex rounded-xl bg-slate-900/[0.05] p-1 text-sm">
          {([['', 'Todos'], ['PARTICULAR', 'Particulares'], ['AGENCIA', 'Agencias']] as const).map(([v, t]) => (
            <button key={v} type="button" onClick={() => setTipo(v)} className={cn('rounded-lg px-3 py-1.5', tipo === v ? 'bg-white font-medium shadow-sm' : 'text-[var(--sec)]')}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="ax-card overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-slate-900/[0.08] text-left text-xs uppercase tracking-wide text-[var(--ter)]">
              <th className="px-3 py-2.5 font-medium">Cliente</th>
              <th className="px-3 py-2.5 font-medium">CUIT / IVA</th>
              <th className="px-3 py-2.5 font-medium">Contacto</th>
              <th className="px-3 py-2.5 text-right font-medium">Reservas</th>
              {verImportes && <th className="px-3 py-2.5 text-right font-medium">Presupuestado</th>}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6">
                  <div className="h-4 animate-pulse rounded bg-slate-900/[0.05]" />
                </td>
              </tr>
            )}
            {!isLoading && clientes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[var(--ter)]">
                  {data?.clientes.length ? 'Ningún cliente con esos filtros.' : 'Todavía no hay clientes cargados.'}
                </td>
              </tr>
            )}
            {clientes.map((c) => (
              <tr key={c.id} className={cn('border-b border-slate-900/[0.05] hover:bg-slate-900/[0.025]', !c.activo && 'opacity-50')}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {c.tipo === 'AGENCIA' ? <Building2 className="h-4 w-4 text-[var(--azul-2)]" /> : <User className="h-4 w-4 text-slate-400" />}
                    <span className="font-medium">{c.nombre}</span>
                    {c.comisionPct > 0 && <span className="ax-chip ax-chip-azul">{c.comisionPct} % comisión</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="ax-num">{c.cuit ? `${c.cuit.slice(0, 2)}-${c.cuit.slice(2, 10)}-${c.cuit.slice(10)}` : '—'}</div>
                  <div className="text-[var(--ter)]">{CONDICIONES_IVA.find((x) => x.valor === c.condicionIva)?.texto}</div>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--sec)]">{[c.telefono, c.email].filter(Boolean).join(' · ') || '—'}</td>
                <td className="ax-num px-3 py-2 text-right">
                  {c.reservas > 0 ? (
                    <Link href={'/eventos/lista' as Route} className="hover:underline" title={c.ultimaFecha ? `Última: ${fechaCorta(c.ultimaFecha)}` : undefined}>
                      {c.reservas}
                    </Link>
                  ) : (
                    <span className="text-[var(--ter)]">0</span>
                  )}
                </td>
                {verImportes && <td className="ax-num whitespace-nowrap px-3 py-2 text-right">{pesos(c.facturado)}</td>}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {puedeEditar && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="text-[var(--ter)]" onClick={() => alternar.mutate(c)}>
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClienteDialog abierto={nuevo || !!editando} cliente={editando} onCerrar={() => { setNuevo(false); setEditando(null) }} />
    </DashboardLayout>
  )
}
