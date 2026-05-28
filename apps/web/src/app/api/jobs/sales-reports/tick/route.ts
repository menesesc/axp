import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSalesReport, resolvePublicBaseUrl } from '@/lib/sales/send-report'
import { computeReportRange } from '@/lib/sales/report-period'

export const dynamic = 'force-dynamic'

// Token compartido con el worker scheduler. Se valida en cada tick.
const SCHEDULER_TOKEN = process.env.SCHEDULER_TOKEN

/**
 * Endpoint llamado por el worker (modo scheduler) cada minuto.
 * Evalúa subscripciones activas y dispara los envíos cuya hora local llegó.
 *
 * Idempotente: el UNIQUE (subscriptionId, fechaInformeDesde) en
 * sales_report_runs garantiza que un mismo período no se envíe dos veces.
 */
export async function POST(request: NextRequest) {
  if (!SCHEDULER_TOKEN) {
    return NextResponse.json({ error: 'SCHEDULER_TOKEN no configurado' }, { status: 500 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${SCHEDULER_TOKEN}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()
  // En prod el contenedor escucha en localhost:8080, así que ni el origin ni
  // el SCHEDULER_API_URL interno sirven como link público. APP_PUBLIC_URL es
  // la fuente de verdad; el body.baseUrl queda como hint para testing.
  let body: { baseUrl?: string } = {}
  try { body = await request.json() } catch { /* tick body opcional */ }
  const baseUrl = resolvePublicBaseUrl({ hint: body.baseUrl, origin: request.nextUrl.origin })

  // Traemos todas las activas. Volumen esperado: pocas decenas.
  const subs = await prisma.sales_report_subscriptions.findMany({
    where: { activo: true },
    select: {
      id: true,
      frecuencia: true,
      diaSemana: true,
      diaMes: true,
      hora: true,
      tz: true,
    },
  })

  const results: Array<{
    subscriptionId: string
    action: 'sent' | 'skip-time' | 'skip-duplicate' | 'fail'
    status?: string
    error?: string
    range?: { from: string; to: string }
  }> = []

  for (const sub of subs) {
    const localNow = nowInTimezone(now, sub.tz)
    if (!shouldFireNow(sub, localNow)) {
      results.push({ subscriptionId: sub.id, action: 'skip-time' })
      continue
    }

    const range = computeReportRange(sub.frecuencia, localNow.asDate)

    // Idempotencia: verificamos si ya hay un run para este período.
    const existing = await prisma.sales_report_runs.findUnique({
      where: {
        subscriptionId_fechaInformeDesde: {
          subscriptionId: sub.id,
          fechaInformeDesde: new Date(`${range.from}T00:00:00Z`),
        },
      },
      select: { id: true, status: true },
    })
    if (existing) {
      results.push({ subscriptionId: sub.id, action: 'skip-duplicate', status: existing.status, range })
      continue
    }

    try {
      const result = await sendSalesReport({
        subscriptionId: sub.id,
        baseUrl,
        rangeOverride: range,
      })
      await prisma.sales_report_runs.create({
        data: {
          subscriptionId: sub.id,
          fechaInformeDesde: new Date(`${range.from}T00:00:00Z`),
          fechaInformeHasta: new Date(`${range.to}T00:00:00Z`),
          status: result.status,
          destinatariosCount: result.destinatariosCount,
          resendMessageIds: result.resendMessageIds,
          error: result.error ?? null,
        },
      })
      results.push({ subscriptionId: sub.id, action: 'sent', status: result.status, range })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Persistimos el fallo en runs igual (para no retry-bombardear).
      try {
        await prisma.sales_report_runs.create({
          data: {
            subscriptionId: sub.id,
            fechaInformeDesde: new Date(`${range.from}T00:00:00Z`),
            fechaInformeHasta: new Date(`${range.to}T00:00:00Z`),
            status: 'FAIL',
            destinatariosCount: 0,
            resendMessageIds: [],
            error: msg.slice(0, 1000),
          },
        })
      } catch {
        // ignore — si ya existe el unique, no pasa nada
      }
      results.push({ subscriptionId: sub.id, action: 'fail', error: msg })
    }
  }

  return NextResponse.json({
    tickAt: now.toISOString(),
    evaluated: subs.length,
    results,
  })
}

/**
 * Calcula "ahora" en la zona horaria dada. Usa Intl para evitar dependencias.
 * Devuelve un objeto con campos year/month/day/dow/hour/minute en local time.
 */
interface LocalNow {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 1=Lunes, ..., 7=Domingo */
  isoDow: number
  /** Date equivalente (usado por computeReportRange como refDate). */
  asDate: Date
}

function nowInTimezone(now: Date, tz: string): LocalNow {
  // Usamos Intl.DateTimeFormat con timezone para obtener parts locales.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  const year = parseInt(get('year'), 10)
  const month = parseInt(get('month'), 10)
  const day = parseInt(get('day'), 10)
  const hour = parseInt(get('hour'), 10) % 24
  const minute = parseInt(get('minute'), 10)
  const weekday = get('weekday')
  const dowMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  const isoDow = dowMap[weekday] ?? 1
  // asDate: construimos un Date con los componentes locales (sin TZ aplicada
  // — sirve solo como refDate para computeReportRange que opera en
  // componentes y).
  const asDate = new Date(year, month - 1, day, hour, minute, 0)
  return { year, month, day, hour, minute, isoDow, asDate }
}

function shouldFireNow(
  sub: { frecuencia: 'DIARIA' | 'SEMANAL' | 'MENSUAL'; diaSemana: number | null; diaMes: number | null; hora: string },
  local: LocalNow
): boolean {
  const [hStr, mStr] = sub.hora.split(':')
  const targetH = parseInt(hStr ?? '7', 10)
  const targetM = parseInt(mStr ?? '0', 10)
  // Tolerancia: este minuto exacto. El worker corre cada 60s, así que matchea
  // una vez por slot.
  if (local.hour !== targetH || local.minute !== targetM) return false

  if (sub.frecuencia === 'DIARIA') return true
  if (sub.frecuencia === 'SEMANAL') {
    return sub.diaSemana != null && local.isoDow === sub.diaSemana
  }
  // MENSUAL: si diaMes > último día del mes (28/29/30/31), ejecutamos el último día.
  const lastDay = new Date(local.year, local.month, 0).getDate()
  const target = Math.min(sub.diaMes ?? 1, lastDay)
  return local.day === target
}
