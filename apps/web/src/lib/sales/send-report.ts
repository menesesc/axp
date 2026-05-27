import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/resend'
import { renderSalesReportEmail, getSalesReportFrom } from '@/lib/email/templates/sales-report'
import { computeReportRange } from '@/lib/sales/report-period'

type Frecuencia = 'DIARIA' | 'SEMANAL' | 'MENSUAL'

export interface SendReportOptions {
  subscriptionId: string
  /** Si se omite, se calcula a partir de la frecuencia y refDate (default = ahora). */
  rangeOverride?: { from: string; to: string }
  /** Para informes "test" no marcamos sales_report_runs. */
  isTest?: boolean
  /** Destinatarios alternativos (override). Si null, usa los de la subscripción. */
  overrideTo?: string[]
  /** Base URL para el link "Ver completo" del email. */
  baseUrl: string
}

export interface SendReportResult {
  status: 'OK' | 'SKIP' | 'FAIL'
  destinatariosCount: number
  resendMessageIds: string[]
  error?: string
  range: { from: string; to: string }
}

export async function sendSalesReport(opts: SendReportOptions): Promise<SendReportResult> {
  const sub = await prisma.sales_report_subscriptions.findUnique({
    where: { id: opts.subscriptionId },
    include: { recipients: true, clientes: true },
  })

  if (!sub) {
    return { status: 'FAIL', destinatariosCount: 0, resendMessageIds: [], error: 'Subscripción no encontrada', range: { from: '', to: '' } }
  }

  const range = opts.rangeOverride ?? computeReportRange(sub.frecuencia as Frecuencia, new Date())

  const rendered = await renderSalesReportEmail({
    clienteId: sub.clienteId,
    from: range.from,
    to: range.to,
    frecuencia: sub.frecuencia as Frecuencia,
    sucursal: sub.sucursal,
    topN: sub.topN,
    baseUrl: opts.baseUrl,
  })

  const to = opts.overrideTo ?? sub.recipients.map((r) => r.email)
  if (to.length === 0) {
    return {
      status: 'SKIP',
      destinatariosCount: 0,
      resendMessageIds: [],
      error: 'Sin destinatarios',
      range,
    }
  }

  // Si no hay datos, igual mandamos el mail "vacío" (el receptor verá que no
  // hubo ventas y puede chequear los cierres). Pero registramos como SKIP en
  // el historial para distinguir de un envío con datos reales.
  const status: 'OK' | 'SKIP' = rendered.hasData ? 'OK' : 'SKIP'

  try {
    const result = await sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      from: getSalesReportFrom(),
    })
    // Resend devuelve { data: { id }, error }
    const id =
      (result as unknown as { data?: { id?: string } }).data?.id ??
      (result as unknown as { id?: string }).id ??
      null
    return {
      status,
      destinatariosCount: to.length,
      resendMessageIds: id ? [id] : [],
      range,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error enviando email'
    return {
      status: 'FAIL',
      destinatariosCount: 0,
      resendMessageIds: [],
      error: msg,
      range,
    }
  }
}
