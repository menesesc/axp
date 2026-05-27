import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendSalesReport } from '@/lib/sales/send-report'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    overrideTo: z.array(z.string().email()).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .optional()
  .default({})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const sub = await prisma.sales_report_subscriptions.findFirst({
    where: { id: params.id, clienteId: user.clienteId },
    select: { id: true },
  })
  if (!sub) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})))
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: err.errors }, { status: 400 })
    }
    throw err
  }

  const baseUrl = request.nextUrl.origin

  const result = await sendSalesReport({
    subscriptionId: params.id,
    baseUrl,
    isTest: true,
    ...(body.overrideTo && body.overrideTo.length > 0 ? { overrideTo: body.overrideTo } : {}),
    ...(body.from && body.to ? { rangeOverride: { from: body.from, to: body.to } } : {}),
  })

  if (result.status === 'FAIL') {
    return NextResponse.json({ error: result.error ?? 'Error', range: result.range }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    destinatariosCount: result.destinatariosCount,
    range: result.range,
  })
}
