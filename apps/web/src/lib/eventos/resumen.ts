import { calcularPlan, dadaDeBaja, porcentajeCobrado, type CuotaDef, type Regimen, type Sigla } from './constantes'
import type { ReservaFila } from './db'

export interface KpisEvento {
  /** Reservas en pie (sin rechazadas ni canceladas). */
  reservas: number
  /** Rechazadas + canceladas. */
  bajas: number
  personas: number
  confirmadas: number
  categorias: { adultos: number; menores: number; bebes: number; liberados: number }
  cupo: number | null
  restante: number | null
  ocupacionPct: number | null
  /** Presupuestado: el total de lo que sigue en pie. */
  total: number
  cobrado: number
  saldo: number
  /** Cobrado de lo que sigue en pie sobre su total. NULL si no hay nada presupuestado. */
  porcentajeCobrado: number | null
  /** Reservas con alguna cuota vencida e impaga, y cuánto suman esas cuotas. */
  vencidas: number
  montoVencido: number
  regimenes: Partial<Record<Regimen, number>>
  /** Reservas y personas en cada estado. */
  porEstado: Partial<Record<Sigla, { reservas: number; personas: number }>>
}

/**
 * Los números de la cabecera del evento. Lo rechazado y lo cancelado no ocupa
 * cupo ni suma a lo presupuestado, pero lo que se cobró de una cancelada
 * (seña retenida) sí cuenta como cobrado; el % cobrado mira sólo lo que
 * sigue en pie.
 */
export function kpisEvento(
  cupo: number | null,
  reservas: ReservaFila[],
  cuotas: Map<string, CuotaDef[]>,
  hoy: string
): KpisEvento {
  const k: KpisEvento = {
    reservas: 0,
    bajas: 0,
    personas: 0,
    confirmadas: 0,
    categorias: { adultos: 0, menores: 0, bebes: 0, liberados: 0 },
    cupo,
    restante: null,
    ocupacionPct: null,
    total: 0,
    cobrado: 0,
    saldo: 0,
    porcentajeCobrado: null,
    vencidas: 0,
    montoVencido: 0,
    regimenes: {},
    porEstado: {},
  }
  let cobradoEnPie = 0
  for (const r of reservas) {
    const e = (k.porEstado[r.sigla] ??= { reservas: 0, personas: 0 })
    e.reservas++
    e.personas += r.personas
    k.cobrado += r.cobrado
    if (dadaDeBaja(r.estado)) {
      k.bajas++
      continue
    }
    cobradoEnPie += r.cobrado
    k.reservas++
    k.personas += r.personas
    if (r.estado === 'APROBADO' || r.estado === 'FINALIZADO') k.confirmadas += r.personas
    k.categorias.adultos += r.adultos
    k.categorias.menores += r.menores
    k.categorias.bebes += r.bebes
    k.categorias.liberados += r.liberados
    k.total += r.total
    k.saldo += r.saldo
    for (const g of r.regimenes) k.regimenes[g.tipo] = (k.regimenes[g.tipo] ?? 0) + g.cantidad
    const plan = calcularPlan(cuotas.get(r.id) ?? [], r.total, r.cobrado, hoy, 0)
    const vencidas = plan.filter((c) => c.estado === 'VENCIDA')
    if (vencidas.length) {
      k.vencidas++
      k.montoVencido += vencidas.reduce((s, c) => s + c.pendiente, 0)
    }
  }
  k.porcentajeCobrado = porcentajeCobrado(k.total, cobradoEnPie)
  if (cupo) {
    k.restante = cupo - k.personas
    k.ocupacionPct = Math.round((k.personas / cupo) * 100)
  }
  return k
}
