'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { Lock, Search, StickyNote } from 'lucide-react'
import { pesos } from '@/components/dashboard/inicio'
import { REGIMENES, dadaDeBaja, fechaCorta, porcentajeCobrado, type Sigla } from '@/lib/eventos/constantes'
import type { ReservaFila } from '@/lib/eventos/db'
import { cn } from '@/lib/utils'
import { BarraCobro, EstadoBadge, LeyendaEstados, alternarSigla, claseSelect, useCatalogos } from './comunes'

/**
 * Tabla de reservas con sus filtros. Pensada para el 31/12 con cien o más
 * reservas en el mismo turno: todo filtra en el navegador (sin ir al server
 * en cada tecla) y abajo quedan los totales de lo que se está viendo.
 *
 * El estado se filtra con los chips de la leyenda (varios a la vez); lo que
 * falta cobrar, con "Con saldo pendiente", que mira el % cobrado y por eso
 * funciona también sin ver importes.
 */
const conSaldoPendiente = (r: ReservaFila) => !dadaDeBaja(r.estado) && (r.porcentajeCobrado ?? 100) < 100

export function TablaReservas({
  reservas,
  verImportes,
  mostrarFecha = false,
  mostrarEvento = false,
  cargando = false,
  acciones,
}: {
  reservas: ReservaFila[]
  verImportes: boolean
  mostrarFecha?: boolean
  mostrarEvento?: boolean
  cargando?: boolean
  acciones?: React.ReactNode
}) {
  const { nombreOrigen, salones } = useCatalogos()
  const [q, setQ] = useState('')
  const [siglas, setSiglas] = useState<Sigla[]>([])
  const [salon, setSalon] = useState('')
  const [conRegimen, setConRegimen] = useState(false)
  const [conSaldo, setConSaldo] = useState(false)

  const conteo = useMemo(() => {
    const c: Partial<Record<Sigla, number>> = {}
    for (const r of reservas) c[r.sigla] = (c[r.sigla] ?? 0) + 1
    return c
  }, [reservas])

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return reservas.filter(
      (r) =>
        (siglas.length === 0 || siglas.includes(r.sigla)) &&
        (!salon || r.sectorId === salon) &&
        (!conRegimen || r.regimenes.length > 0) &&
        (!conSaldo || conSaldoPendiente(r)) &&
        (!t ||
          r.nombre.toLowerCase().includes(t) ||
          (r.contactoNombre ?? '').toLowerCase().includes(t) ||
          (r.contactoTelefono ?? '').includes(t) ||
          (r.titularNombre ?? '').toLowerCase().includes(t) ||
          String(r.numero) === t ||
          r.mesas.some((m) => m.toLowerCase() === t))
    )
  }, [reservas, q, siglas, salon, conRegimen, conSaldo])

  const tot = useMemo(() => {
    const vivas = filtradas.filter((r) => !dadaDeBaja(r.estado))
    const total = vivas.reduce((s, r) => s + r.total, 0)
    return {
      personas: vivas.reduce((s, r) => s + r.personas, 0),
      total,
      cobrado: filtradas.reduce((s, r) => s + r.cobrado, 0),
      saldo: vivas.reduce((s, r) => s + r.saldo, 0),
      pct: porcentajeCobrado(total, vivas.reduce((s, r) => s + r.cobrado, 0)),
    }
  }, [filtradas])

  const alternar = (s: Sigla) => setSiglas((xs) => alternarSigla(xs, s))
  const filtros = (q ? 1 : 0) + siglas.length + (salon ? 1 : 0) + (conRegimen ? 1 : 0) + (conSaldo ? 1 : 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-10 min-w-[12rem] flex-1 items-center sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, teléfono, #, mesa"
            className="h-10 w-full rounded-xl border border-slate-900/[0.12] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#3b9bff] focus:ring-4 focus:ring-[#3b9bff]/15"
          />
        </label>
        {salones.length > 1 && (
          <select value={salon} onChange={(e) => setSalon(e.target.value)} className={cn(claseSelect, 'w-auto rounded-xl')}>
            <option value="">Todos los salones</option>
            {salones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
        <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-900/[0.12] bg-white px-3 text-sm">
          <input type="checkbox" checked={conRegimen} onChange={(e) => setConRegimen(e.target.checked)} />
          Con régimen especial
        </label>
        <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-900/[0.12] bg-white px-3 text-sm">
          <input type="checkbox" checked={conSaldo} onChange={(e) => setConSaldo(e.target.checked)} />
          Con saldo pendiente
        </label>
        {filtros > 0 && (
          <button
            type="button"
            onClick={() => {
              setQ('')
              setSiglas([])
              setSalon('')
              setConRegimen(false)
              setConSaldo(false)
            }}
            className="h-10 rounded-xl px-3 text-sm text-[var(--azul-2)] hover:bg-slate-900/[0.05]"
          >
            Limpiar
          </button>
        )}
        <div className="ml-auto flex gap-2">{acciones}</div>
      </div>
      <LeyendaEstados conteo={conteo} activas={siglas} onAlternar={alternar} />

      <div className="ax-card overflow-x-auto p-0">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-slate-900/[0.08] text-left text-xs uppercase tracking-wide text-[var(--ter)]">
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Reserva</th>
              {mostrarFecha && <th className="px-3 py-2.5 font-medium">Fecha</th>}
              <th className="px-3 py-2.5 text-right font-medium">Pers.</th>
              <th className="px-3 py-2.5 font-medium">Regímenes</th>
              <th className="px-3 py-2.5 font-medium">Salón / mesa</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Origen</th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium">Cobrado</th>
              {verImportes && (
                <>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">$ cobrado</th>
                  <th className="px-3 py-2.5 text-right font-medium">Saldo</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {cargando &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-900/[0.05]">
                  <td colSpan={12} className="px-3 py-3">
                    <div className="h-4 animate-pulse rounded bg-slate-900/[0.05]" />
                  </td>
                </tr>
              ))}
            {!cargando && filtradas.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-sm text-[var(--ter)]">
                  {reservas.length === 0 ? 'Todavía no hay reservas.' : 'Ninguna reserva con esos filtros.'}
                </td>
              </tr>
            )}
            {filtradas.map((r) => (
              <tr key={r.id} className={cn('border-b border-slate-900/[0.05] hover:bg-slate-900/[0.025]', dadaDeBaja(r.estado) && 'opacity-55')}>
                <td className="ax-num px-3 py-2 text-[var(--ter)]">{r.numero}</td>
                <td className="max-w-[16rem] px-3 py-2">
                  <Link href={`/eventos/reserva/${r.id}` as Route} className="font-medium text-slate-900 hover:text-[var(--azul-2)] hover:underline">
                    {r.nombre}
                  </Link>
                  <div className="truncate text-xs text-[var(--ter)]">
                    {[r.contactoNombre, r.contactoTelefono, r.titularNombre && `Cliente: ${r.titularNombre}`].filter(Boolean).join(' · ')}
                    {mostrarEvento && r.eventoNombre && <span> · {r.eventoNombre}</span>}
                  </div>
                </td>
                {mostrarFecha && (
                  <td className="whitespace-nowrap px-3 py-2">
                    {fechaCorta(r.fecha, true)}
                    {r.hora && <span className="text-[var(--ter)]"> {r.hora}</span>}
                  </td>
                )}
                <td className="ax-num px-3 py-2 text-right font-medium" title={`${r.adultos} adultos · ${r.menores} menores · ${r.bebes} bebés · ${r.liberados} liberados`}>
                  {r.personas}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.regimenes.map((g, i) => (
                      <span key={i} className="ax-chip ax-chip-ambar !px-1.5 !py-0 text-[11px]" title={g.nota ?? undefined}>
                        {g.cantidad} {REGIMENES.find((x) => x.valor === g.tipo)?.corto}
                      </span>
                    ))}
                    {(r.observaciones || r.notaServicio) && <StickyNote className="h-3.5 w-3.5 text-slate-400" aria-label="Tiene observaciones" />}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {r.salon && <span className="text-[var(--sec)]">{r.salon}</span>}
                  {r.mesas.length > 0 && (
                    <span className="ml-1 inline-flex items-center gap-0.5 font-medium">
                      {r.mesaInamovible && <Lock className="h-3 w-3 text-amber-600" aria-label="Mesa inamovible" />}
                      {r.mesas.join(', ')}
                    </span>
                  )}
                </td>
                <td className="hidden px-3 py-2 text-xs text-[var(--sec)] lg:table-cell">{nombreOrigen(r.origen)}</td>
                <td className="px-3 py-2">
                  <EstadoBadge sigla={r.sigla} />
                </td>
                <td className="px-3 py-2">
                  <BarraCobro pct={r.porcentajeCobrado} />
                </td>
                {verImportes && (
                  <>
                    <td className="ax-num whitespace-nowrap px-3 py-2 text-right">{pesos(r.total)}</td>
                    <td className="ax-num hidden whitespace-nowrap px-3 py-2 text-right text-[var(--verde)] md:table-cell">{pesos(r.cobrado)}</td>
                    <td className={cn('ax-num whitespace-nowrap px-3 py-2 text-right', r.saldo > 0 && !dadaDeBaja(r.estado) ? 'font-medium' : 'text-[var(--ter)]')}>
                      {pesos(r.saldo)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {filtradas.length > 0 && (
            <tfoot>
              <tr className="bg-slate-900/[0.025] text-sm font-medium">
                <td className="px-3 py-2.5" colSpan={mostrarFecha ? 3 : 2}>
                  {filtradas.length} reserva{filtradas.length === 1 ? '' : 's'}
                  {filtradas.length !== reservas.length && <span className="font-normal text-[var(--ter)]"> de {reservas.length}</span>}
                </td>
                <td className="ax-num px-3 py-2.5 text-right">{tot.personas}</td>
                <td colSpan={4} className="px-3 py-2.5 text-xs font-normal text-[var(--ter)]">
                  sin contar rechazadas ni canceladas
                </td>
                <td className="px-3 py-2.5">{verImportes && <BarraCobro pct={tot.pct} />}</td>
                {verImportes && (
                  <>
                    <td className="ax-num whitespace-nowrap px-3 py-2.5 text-right">{pesos(tot.total)}</td>
                    <td className="ax-num hidden whitespace-nowrap px-3 py-2.5 text-right text-[var(--verde)] md:table-cell">{pesos(tot.cobrado)}</td>
                    <td className="ax-num whitespace-nowrap px-3 py-2.5 text-right">{pesos(tot.saldo)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
