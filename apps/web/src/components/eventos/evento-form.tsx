'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { pesos } from '@/components/dashboard/inicio'
import { IVA_MODOS, PAGO_MODOS, calcularTotal, parsearMonto, type IvaModo, type PagoModo } from '@/lib/eventos/constantes'
import type { EventoBase } from '@/lib/eventos/db'
import { Campo, SelectSimple, claseSelect, claseTextarea, useCatalogos } from './comunes'

export type FormEvento = {
  nombre: string
  tipo: string
  fecha: string
  horaInicio: string
  horaFin: string
  cupo: string
  salonIds: string[]
  precioAdulto: string
  precioMenor: string
  ivaModo: IvaModo
  ivaAlicuota: string
  pagoModo: PagoModo
  senaPct: string
  senaMonto: string
  senaVence: string
  saldoVence: string
  observaciones: string
}

export function formDe(e: EventoBase | null, fecha?: string): FormEvento {
  const s = (n: number | null | undefined) => (n == null || n === 0 ? '' : String(n))
  return {
    nombre: e?.nombre ?? '',
    tipo: e?.tipo ?? 'OTRO',
    fecha: e?.fecha ?? fecha ?? '',
    horaInicio: e?.horaInicio ?? '',
    horaFin: e?.horaFin ?? '',
    cupo: s(e?.cupo),
    salonIds: e?.salonIds ?? [],
    precioAdulto: s(e?.precioAdulto),
    precioMenor: s(e?.precioMenor),
    ivaModo: e?.ivaModo ?? 'FINAL',
    ivaAlicuota: String(e?.ivaAlicuota ?? 21),
    pagoModo: e?.pagoModo ?? 'NINGUNA',
    senaPct: s(e?.senaPct),
    senaMonto: s(e?.senaMonto),
    senaVence: e?.senaVence ?? '',
    saldoVence: e?.saldoVence ?? '',
    observaciones: e?.observaciones ?? '',
  }
}

const n = (v: string) => parsearMonto(v)

/**
 * Lo que viaja al server. Los vacíos van como null. Sin permiso de importes
 * la plata no se manda: el server la devolvió en cero y guardarla así
 * borraría los precios reales.
 */
export function cuerpoDe(f: FormEvento, conPlata = true) {
  const base = {
    nombre: f.nombre,
    tipo: f.tipo,
    fecha: f.fecha,
    horaInicio: f.horaInicio || null,
    horaFin: f.horaFin || null,
    cupo: n(f.cupo),
    salonIds: f.salonIds,
    observaciones: f.observaciones,
  }
  if (!conPlata) return base
  return {
    ...base,
    precioAdulto: n(f.precioAdulto) ?? 0,
    precioMenor: n(f.precioMenor) ?? 0,
    ivaModo: f.ivaModo,
    ivaAlicuota: n(f.ivaAlicuota) ?? 21,
    pagoModo: f.pagoModo,
    senaPct: f.pagoModo === 'SENA_PCT' ? n(f.senaPct) : null,
    senaMonto: f.pagoModo === 'SENA_MONTO' ? n(f.senaMonto) : null,
    senaVence: f.pagoModo === 'NINGUNA' ? null : f.senaVence || null,
    saldoVence: f.pagoModo === 'NINGUNA' || f.pagoModo === 'TOTAL' ? null : f.saldoVence || null,
  }
}

/**
 * Las condiciones compartidas del evento: fecha y turno, salones, cupo,
 * precios por categoría, IVA y regla de pago. Todas las reservas del evento
 * las heredan; una reserva puede pisar precios a mano.
 */
export function EventoForm({
  inicial,
  verImportes,
  guardando,
  onGuardar,
  textoBoton = 'Guardar',
  extra,
}: {
  inicial: FormEvento
  verImportes: boolean
  guardando: boolean
  onGuardar: (f: FormEvento) => void
  textoBoton?: string
  extra?: React.ReactNode
}) {
  const { tipos, salones } = useCatalogos()
  const [f, setF] = useState(inicial)
  useEffect(() => setF(inicial), [inicial])
  const set = <K extends keyof FormEvento>(k: K) => (v: FormEvento[K]) => setF((x) => ({ ...x, [k]: v }))
  const ev = (k: keyof FormEvento) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  const ejemplo = calcularTotal({
    adultos: 1,
    menores: 0,
    liberados: 0,
    precioAdulto: n(f.precioAdulto) ?? 0,
    precioMenor: 0,
    precioLiberado: 0,
    descuento: 0,
    ivaModo: f.ivaModo,
    ivaAlicuota: n(f.ivaAlicuota) ?? 21,
  })

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        onGuardar(f)
      }}
    >
      <section className="grid gap-3 sm:grid-cols-6">
        <Campo etiqueta="Nombre" className="sm:col-span-4">
          <Input value={f.nombre} onChange={ev('nombre')} placeholder="Fin de año · turno noche" />
        </Campo>
        <Campo etiqueta="Tipo" className="sm:col-span-2">
          <select value={f.tipo} onChange={(e) => set('tipo')(e.target.value)} className={claseSelect}>
            {tipos.map((t) => (
              <option key={t.clave} value={t.clave} disabled={!t.activo}>
                {t.nombre}
              </option>
            ))}
            {!tipos.some((t) => t.clave === f.tipo) && <option value={f.tipo}>{f.tipo}</option>}
          </select>
        </Campo>
        <Campo etiqueta="Fecha" className="sm:col-span-2">
          <Input type="date" value={f.fecha} onChange={ev('fecha')} />
        </Campo>
        <Campo etiqueta="Desde">
          <Input type="time" value={f.horaInicio} onChange={ev('horaInicio')} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Input type="time" value={f.horaFin} onChange={ev('horaFin')} />
        </Campo>
        <Campo etiqueta="Cupo (personas)" className="sm:col-span-2" ayuda="Vacío = sin tope">
          <Input value={f.cupo} onChange={ev('cupo')} inputMode="numeric" />
        </Campo>
        {salones.length > 0 && (
          <div className="sm:col-span-6">
            <span className="mb-1 block text-xs font-medium text-slate-500">Salones habilitados</span>
            <div className="flex flex-wrap gap-2">
              {salones.map((s) => {
                const on = f.salonIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => set('salonIds')(on ? f.salonIds.filter((x) => x !== s.id) : [...f.salonIds, s.id])}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'}`}
                  >
                    {s.nombre}
                    <span className={`ml-1 text-xs ${on ? 'text-white/60' : 'text-slate-400'}`}>{s.mesas.length} mesas</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {verImportes && (
        <section className="grid gap-3 rounded-xl border border-slate-900/[0.08] bg-slate-900/[0.015] p-3 sm:grid-cols-6">
          <p className="text-sm font-medium sm:col-span-6">Precios por persona</p>
          <Campo etiqueta="Adulto" className="sm:col-span-2">
            <Input value={f.precioAdulto} onChange={ev('precioAdulto')} inputMode="decimal" placeholder="0" />
          </Campo>
          <Campo etiqueta="Menor" className="sm:col-span-2">
            <Input value={f.precioMenor} onChange={ev('precioMenor')} inputMode="decimal" placeholder="0" />
          </Campo>
          <p className="self-end pb-2 text-xs text-[var(--ter)] sm:col-span-2">
            Bebés: siempre gratis. Liberados: gratis, o un precio preferencial a mano en cada reserva.
          </p>
          <Campo etiqueta="IVA" className="sm:col-span-3">
            <SelectSimple value={f.ivaModo} onChange={(v) => set('ivaModo')(v as IvaModo)} opciones={IVA_MODOS} />
          </Campo>
          <Campo etiqueta="Alícuota %" className="sm:col-span-1">
            <Input value={f.ivaAlicuota} onChange={ev('ivaAlicuota')} inputMode="decimal" disabled={f.ivaModo === 'FINAL'} />
          </Campo>
          <p className="self-end pb-2 text-xs text-[var(--sec)] sm:col-span-2">
            Un adulto paga <b className="ax-num">{pesos(ejemplo.total)}</b>
            {ejemplo.iva > 0 && <span className="text-[var(--ter)]"> (IVA {pesos(ejemplo.iva)})</span>}
          </p>

          <p className="mt-2 text-sm font-medium sm:col-span-6">Regla de pago</p>
          <Campo etiqueta="Forma" className="sm:col-span-2">
            <SelectSimple value={f.pagoModo} onChange={(v) => set('pagoModo')(v as PagoModo)} opciones={PAGO_MODOS} />
          </Campo>
          {f.pagoModo === 'SENA_PCT' && (
            <Campo etiqueta="Seña %">
              <Input value={f.senaPct} onChange={ev('senaPct')} inputMode="decimal" placeholder="30" />
            </Campo>
          )}
          {f.pagoModo === 'SENA_MONTO' && (
            <Campo etiqueta="Seña $">
              <Input value={f.senaMonto} onChange={ev('senaMonto')} inputMode="decimal" />
            </Campo>
          )}
          {f.pagoModo !== 'NINGUNA' && (
            <Campo etiqueta={f.pagoModo === 'TOTAL' ? 'Pagar antes del' : 'Seña antes del'} ayuda="Pasada la fecha sólo se avisa">
              <Input type="date" value={f.senaVence} onChange={ev('senaVence')} />
            </Campo>
          )}
          {(f.pagoModo === 'SENA_PCT' || f.pagoModo === 'SENA_MONTO') && (
            <Campo etiqueta="Saldo antes del" ayuda="Vacío = el día del evento">
              <Input type="date" value={f.saldoVence} onChange={ev('saldoVence')} />
            </Campo>
          )}
        </section>
      )}

      <Campo etiqueta="Observaciones">
        <textarea value={f.observaciones} onChange={ev('observaciones')} className={claseTextarea} />
      </Campo>

      {extra}

      <div className="flex justify-end">
        <Button type="submit" disabled={guardando || !f.nombre.trim() || !f.fecha}>
          {guardando ? 'Guardando…' : textoBoton}
        </Button>
      </div>
    </form>
  )
}
