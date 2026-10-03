import { NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'
import { cbusDelCliente, cbuValido } from '@/lib/proveedores/cbu'

export const dynamic = 'force-dynamic'

/**
 * Bandeja "A transferir": todos los borradores, con el motivo por el que alguno
 * no puede ir al archivo del banco (sin CBU, medios que no son transferencia,
 * totales que no cierran).
 */
export async function GET() {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const [pagos, cbus] = await Promise.all([
    prisma.pagos.findMany({
      where: { clienteId: user.clienteId, estado: 'BORRADOR' },
      include: {
        proveedores: { select: { id: true, razonSocial: true, cuit: true } },
        pago_documentos: {
          include: {
            documentos: {
              select: { id: true, tipo: true, letra: true, numeroCompleto: true, fechaEmision: true, fechaVencimiento: true, total: true },
            },
          },
        },
        pago_metodos: { select: { tipo: true, monto: true } },
      },
      orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
    }),
    cbusDelCliente(user.clienteId),
  ])

  return NextResponse.json({
    borradores: pagos.map((p) => {
      const cbu = cbus.get(p.proveedorId) ?? null
      const montoTotal = Number(p.montoTotal)
      const totalMetodos = p.pago_metodos.reduce((s, m) => s + Number(m.monto), 0)
      const problemas: string[] = []
      if (p.pago_documentos.length === 0) problemas.push('Sin documentos')
      if (!cbu) problemas.push('Proveedor sin CBU')
      else if (!cbuValido(cbu)) problemas.push('CBU inválido')
      if (p.pago_metodos.length === 0) problemas.push('Sin forma de pago')
      else if (p.pago_metodos.some((m) => m.tipo !== 'TRANSFERENCIA')) problemas.push('Incluye pagos que no son transferencia')
      if (Math.abs(totalMetodos - montoTotal) > 0.01) problemas.push('Formas de pago no suman el total')
      if (montoTotal <= 0) problemas.push('Total en cero')

      return {
        id: p.id,
        numero: p.numero,
        fecha: p.fecha.toISOString().slice(0, 10),
        montoTotal,
        nota: p.nota,
        proveedor: { ...p.proveedores, cbu },
        documentos: p.pago_documentos.map((pd) => ({
          id: pd.documentos.id,
          tipo: pd.documentos.tipo,
          letra: pd.documentos.letra,
          numeroCompleto: pd.documentos.numeroCompleto,
          fechaEmision: pd.documentos.fechaEmision?.toISOString().slice(0, 10) ?? null,
          fechaVencimiento: pd.documentos.fechaVencimiento?.toISOString().slice(0, 10) ?? null,
          montoAplicado: Number(pd.montoAplicado),
        })),
        problemas,
      }
    }),
  })
}
