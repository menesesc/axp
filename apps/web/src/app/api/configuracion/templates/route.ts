import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TEMPLATES } from '@/lib/email/templates/defaults'
import { z } from 'zod'

const TIPOS = ['ORDEN_PAGO', 'COMPARTIR_DOCUMENTOS'] as const

// GET: Returns templates for the client (custom or defaults)
export async function GET() {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const customTemplates = await prisma.email_templates.findMany({
    where: { clienteId: user.clienteId },
  })

  const templates = TIPOS.map((tipo) => {
    const custom = customTemplates.find((t) => t.tipo === tipo)
    const defaults = DEFAULT_TEMPLATES[tipo]
    return {
      tipo,
      asunto: custom?.asunto || defaults.asunto,
      cuerpo: custom?.cuerpo || defaults.cuerpo,
      isCustom: !!custom,
      activo: custom?.activo ?? true,
    }
  })

  return NextResponse.json({ templates })
}

const updateSchema = z.object({
  tipo: z.enum(TIPOS),
  asunto: z.string().min(1).max(500),
  cuerpo: z.string().min(1),
})

// PUT: Create or update a template
export async function PUT(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const template = await prisma.email_templates.upsert({
      where: {
        clienteId_tipo: {
          clienteId: user.clienteId,
          tipo: data.tipo,
        },
      },
      update: {
        asunto: data.asunto,
        cuerpo: data.cuerpo,
        updatedAt: new Date(),
      },
      create: {
        clienteId: user.clienteId,
        tipo: data.tipo,
        asunto: data.asunto,
        cuerpo: data.cuerpo,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ template })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: err.errors },
        { status: 400 }
      )
    }
    console.error('Error updating template:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

const deleteSchema = z.object({
  tipo: z.enum(TIPOS),
})

// DELETE: Remove custom template (revert to default)
export async function DELETE(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { tipo } = deleteSchema.parse(body)

    await prisma.email_templates.deleteMany({
      where: {
        clienteId: user.clienteId,
        tipo,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error('Error deleting template:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
