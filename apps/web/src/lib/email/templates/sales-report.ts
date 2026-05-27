import { prisma } from '@/lib/prisma'
import { fetchRankingByRubro, type RankingByRubroResult } from '@/lib/sales/ranking-by-rubro-query'
import { formatRangeHuman, labelForFrecuencia } from '@/lib/sales/report-period'

type Frecuencia = 'DIARIA' | 'SEMANAL' | 'MENSUAL'

export interface RenderSalesReportArgs {
  clienteId: string
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
  frecuencia: Frecuencia
  sucursal?: string | null
  topN?: number
  baseUrl: string
}

export interface RenderedReport {
  subject: string
  html: string
  hasData: boolean
}

const SALES_REPORT_FROM = 'AXP Ventas <no-reply@axp.com.ar>'

export function getSalesReportFrom(): string {
  return SALES_REPORT_FROM
}

export async function renderSalesReportEmail(args: RenderSalesReportArgs): Promise<RenderedReport> {
  const cliente = await prisma.clientes.findUnique({
    where: { id: args.clienteId },
    select: { razonSocial: true },
  })
  const empresaNombre = cliente?.razonSocial ?? 'Empresa'

  const data = await fetchRankingByRubro({
    clienteId: args.clienteId,
    from: args.from,
    to: args.to,
    sucursal: args.sucursal ?? null,
    topN: args.topN ?? 10,
  })

  const rangoHuman = formatRangeHuman(args.from, args.to)
  const tipo = labelForFrecuencia(args.frecuencia)
  const subject = `Informe ${tipo} de ventas · ${rangoHuman} · ${empresaNombre}`

  if (data.totales.importe === 0 && data.rubros.length === 0) {
    return {
      subject,
      hasData: false,
      html: renderEmptyEmail({ empresaNombre, rangoHuman, tipo, baseUrl: args.baseUrl, from: args.from, to: args.to, frecuencia: args.frecuencia }),
    }
  }

  const verCompletoUrl = buildVistaUrl({
    baseUrl: args.baseUrl,
    from: args.from,
    to: args.to,
    frecuencia: args.frecuencia,
    sucursal: args.sucursal ?? null,
  })

  const html = renderEmailHtml({
    empresaNombre,
    rangoHuman,
    tipo,
    sucursal: args.sucursal ?? null,
    data,
    verCompletoUrl,
  })

  return { subject, html, hasData: true }
}

function buildVistaUrl(args: {
  baseUrl: string
  from: string
  to: string
  frecuencia: Frecuencia
  sucursal: string | null
}): string {
  const url = new URL('/informes/ventas', args.baseUrl)
  url.searchParams.set('from', args.from)
  url.searchParams.set('to', args.to)
  url.searchParams.set('frec', args.frecuencia)
  if (args.sucursal) url.searchParams.set('sucursal', args.sucursal)
  return url.toString()
}

function fmtAR(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(n)
}

function fmtNum(n: number, decimals = 0): string {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n)
}

function esc(s: string | null | undefined): string {
  if (s == null) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const COLORS = {
  bg: '#f5f5f5',
  card: '#ffffff',
  border: '#e2e8f0',
  headerBg: '#0f172a',
  headerText: '#ffffff',
  text: '#1e293b',
  textSoft: '#64748b',
  accent: '#6366f1',
  accentBg: '#eef2ff',
  almuerzo: '#b45309',
  almuerzoBg: '#fffbeb',
  cena: '#4338ca',
  cenaBg: '#eef2ff',
  totalBg: '#f8fafc',
}

function wrapLayout(bodyHtml: string, opts: { empresaNombre: string; tipo: string }): string {
  // Responsive: las clases .stack-* se ajustan en pantallas chicas. La
  // mayoría de los clientes mobile (iOS Mail, Gmail mobile, Outlook iOS)
  // soportan @media. Para los que no, el layout default ya es escalable
  // porque usamos table widths relativos a <=680px y padding moderado.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>Informe ${esc(opts.tipo)} de ventas</title>
<style>
  @media only screen and (max-width: 600px) {
    .container { width:100% !important; max-width:100% !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
    .padded { padding:16px !important; }
    .padded-h { padding-left:14px !important; padding-right:14px !important; }
    .kpi-cell { display:block !important; width:100% !important; padding:0 !important; padding-bottom:6px !important; }
    .kpi-card { padding:8px 10px !important; }
    .kpi-label { font-size:10px !important; }
    .kpi-value { font-size:16px !important; }
    .hide-mobile { display:none !important; }
    .mobile-only { display:block !important; }
    .product-cell { font-size:12px !important; padding:6px 8px !important; }
    .nums-cell { font-size:11px !important; padding:6px 8px !important; }
    .rubro-title { font-size:13px !important; }
    .rubro-subtitle { font-size:11px !important; }
    .header-empresa { font-size:16px !important; }
    .cta-button { display:block !important; width:auto !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${COLORS.text};-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};padding:16px 0;">
<tr><td align="center">
<table class="container" width="680" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.card};border-radius:8px;overflow:hidden;border:1px solid ${COLORS.border};max-width:680px;">
<tr><td class="padded" style="background:${COLORS.headerBg};color:${COLORS.headerText};padding:20px 28px;">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.6;">AXP · Informe ${esc(opts.tipo)} de ventas</div>
<div class="header-empresa" style="font-size:18px;font-weight:600;margin-top:4px;">${esc(opts.empresaNombre)}</div>
</td></tr>
<tr><td class="padded" style="padding:20px 24px;">
${bodyHtml}
</td></tr>
<tr><td class="padded" style="background:${COLORS.totalBg};padding:14px 24px;color:${COLORS.textSoft};font-size:11px;text-align:center;border-top:1px solid ${COLORS.border};">
Este informe se envió automáticamente desde AXP. Para cambiar destinatarios o frecuencia, editá la subscripción desde Configuración → Informes.
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

function renderEmptyEmail(args: {
  empresaNombre: string
  rangoHuman: string
  tipo: string
  baseUrl: string
  from: string
  to: string
  frecuencia: Frecuencia
}): string {
  const url = buildVistaUrl({ ...args, sucursal: null })
  const body = `
<p style="margin:0 0 8px 0;font-size:14px;color:${COLORS.textSoft};">Período: <strong style="color:${COLORS.text};">${esc(args.rangoHuman)}</strong></p>
<div style="background:${COLORS.accentBg};border:1px solid ${COLORS.accent};border-radius:8px;padding:16px;margin-top:16px;">
<p style="margin:0;color:${COLORS.text};font-size:14px;">No hay cierres registrados para este período. Si esperabas ver ventas, revisá que los cierres de Maxirest hayan llegado por email.</p>
</div>
<p style="margin-top:16px;font-size:13px;"><a href="${esc(url)}" style="color:${COLORS.accent};">Ver detalle online</a></p>`
  return wrapLayout(body, { empresaNombre: args.empresaNombre, tipo: args.tipo })
}

function renderEmailHtml(args: {
  empresaNombre: string
  rangoHuman: string
  tipo: string
  sucursal: string | null
  data: RankingByRubroResult
  verCompletoUrl: string
}): string {
  const { data } = args
  const ventasTotal = data.totales.almuerzo + data.totales.cena + data.totales.otro
  const ticketProm = data.totales.tickets > 0 ? ventasTotal / data.totales.tickets : 0

  // KPIs top
  const kpis = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px 0;">
<tr>
${kpiCell('Ventas totales', fmtAR(ventasTotal), COLORS.accentBg, COLORS.accent)}
${kpiCell('Tickets', fmtNum(data.totales.tickets), COLORS.totalBg, COLORS.textSoft)}
${kpiCell('Ticket prom.', fmtAR(ticketProm), COLORS.totalBg, COLORS.textSoft)}
</tr>
<tr><td colspan="3" style="height:8px;line-height:0;font-size:0;">&nbsp;</td></tr>
<tr>
${kpiCell('Mediodía', fmtAR(data.totales.almuerzo), COLORS.almuerzoBg, COLORS.almuerzo)}
${kpiCell('Noche', fmtAR(data.totales.cena), COLORS.cenaBg, COLORS.cena)}
${kpiCell('Días', fmtNum(data.rango.dias), COLORS.totalBg, COLORS.textSoft)}
</tr>
</table>`

  const rubrosHtml = data.rubros.map((r) => renderRubroTable(r)).join('\n')

  const cta = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px 0;">
<tr><td align="center">
<a href="${esc(args.verCompletoUrl)}" style="display:inline-block;background:${COLORS.accent};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:6px;">Ver completo y filtrar online</a>
</td></tr>
<tr><td align="center" style="padding-top:8px;color:${COLORS.textSoft};font-size:12px;">
Cambiá las fechas, buscá productos (ej. "BIF") y desglosá por día.
</td></tr>
</table>`

  const meta = `
<p style="margin:0;font-size:13px;color:${COLORS.textSoft};">
Período: <strong style="color:${COLORS.text};">${esc(args.rangoHuman)}</strong>${
    args.sucursal ? ` · Sucursal: <strong style="color:${COLORS.text};">${esc(args.sucursal)}</strong>` : ''
  }
</p>`

  const body = `${meta}
${kpis}
${rubrosHtml}
${cta}`

  return wrapLayout(body, { empresaNombre: args.empresaNombre, tipo: args.tipo })
}

function kpiCell(label: string, value: string, bg: string, color: string): string {
  return `<td class="kpi-cell" valign="top" width="33%" style="padding:0 4px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};border-radius:6px;border:1px solid ${COLORS.border};">
<tr><td class="kpi-card" style="padding:10px 12px;">
<div class="kpi-label" style="font-size:11px;color:${COLORS.textSoft};text-transform:uppercase;letter-spacing:.5px;">${esc(label)}</div>
<div class="kpi-value" style="font-size:18px;font-weight:600;color:${color};margin-top:2px;">${esc(value)}</div>
</td></tr>
</table>
</td>`
}

function renderRubroTable(r: RankingByRubroResult['rubros'][number]): string {
  const nombre = r.rubroNombre || '(Sin rubro)'
  const subtitle = `${fmtAR(r.totales.importe)} · ${fmtNum(r.totales.unidades)} unidades`

  if (r.items.length === 0) {
    return ''
  }

  // Mobile: una sola línea con nombre + total a la derecha, y un sub-renglón
  // chico con M/N. Desktop: 4 columnas como antes. Logramos esto duplicando
  // las celdas (M y N solo visibles en desktop) y agregando un mobile-only
  // span con la info de turnos abajo del nombre.
  const rows = r.items
    .map((it) => {
      const med = it.almuerzo_u > 0 ? `${fmtNum(it.almuerzo_u)} · ${fmtAR(it.almuerzo_i)}` : '—'
      const noc = it.cena_u > 0 ? `${fmtNum(it.cena_u)} · ${fmtAR(it.cena_i)}` : '—'
      return `<tr>
<td class="product-cell" style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};color:${COLORS.text};font-size:13px;vertical-align:top;">
${esc(it.nombre)}${it.codigo === '****' ? '' : ` <span style="color:${COLORS.textSoft};font-size:11px;">(${esc(it.codigo)})</span>`}
<div style="display:none;font-size:11px;margin-top:3px;color:${COLORS.textSoft};" class="mobile-only">
<span style="color:${COLORS.almuerzo};">M: ${med}</span> &nbsp; <span style="color:${COLORS.cena};">N: ${noc}</span>
</div>
</td>
<td class="hide-mobile nums-cell" style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};color:${COLORS.almuerzo};font-size:12px;white-space:nowrap;" align="right">${med}</td>
<td class="hide-mobile nums-cell" style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};color:${COLORS.cena};font-size:12px;white-space:nowrap;" align="right">${noc}</td>
<td class="nums-cell" style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};color:${COLORS.text};font-size:13px;white-space:nowrap;font-weight:600;" align="right">${fmtAR(it.importe)}</td>
</tr>`
    })
    .join('\n')

  const restantesRow =
    r.itemsRestantes > 0
      ? `<tr><td colspan="4" style="padding:8px 10px;color:${COLORS.textSoft};font-size:12px;font-style:italic;text-align:center;background:${COLORS.totalBg};">+ ${r.itemsRestantes} producto${r.itemsRestantes === 1 ? '' : 's'} más — ver completo online</td></tr>`
      : ''

  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden;margin-bottom:16px;">
<tr><td style="background:${COLORS.totalBg};padding:10px 14px;border-bottom:1px solid ${COLORS.border};">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-size:14px;font-weight:600;color:${COLORS.text};">${esc(nombre)}</td>
<td align="right" style="font-size:12px;color:${COLORS.textSoft};">${esc(subtitle)}</td>
</tr>
</table>
</td></tr>
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<thead>
<tr>
<th align="left" style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${COLORS.textSoft};font-weight:600;background:${COLORS.card};border-bottom:1px solid ${COLORS.border};">Producto</th>
<th class="hide-mobile" align="right" style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${COLORS.almuerzo};font-weight:600;background:${COLORS.card};border-bottom:1px solid ${COLORS.border};">Mediodía (u · $)</th>
<th class="hide-mobile" align="right" style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${COLORS.cena};font-weight:600;background:${COLORS.card};border-bottom:1px solid ${COLORS.border};">Noche (u · $)</th>
<th align="right" style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${COLORS.text};font-weight:600;background:${COLORS.card};border-bottom:1px solid ${COLORS.border};">Total</th>
</tr>
</thead>
<tbody>
${rows}
${restantesRow}
</tbody>
</table>
</td></tr>
</table>`
}
