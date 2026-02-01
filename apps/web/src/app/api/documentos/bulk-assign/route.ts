import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { determineEstadoRevision, calculateMissingFields } from '@/lib/documento-estado'
import { requireAdmin } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: Asignar proveedor a múltiples documentos
export async function POST(request: NextRequest) {
  try {
    // Requiere permisos de administrador
    const { user, error: authError } = await requireAdmin()
    if (authError) return authError

    const clienteId = user?.clienteId

    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { documentoIds, proveedorId } = body

    if (!Array.isArray(documentoIds) || documentoIds.length === 0) {
      return NextResponse.json(
        { error: 'documentoIds debe ser un array no vacío' },
        { status: 400 }
      )
    }

    // Si proveedorId es null, estamos desasignando
    // Si tiene valor, verificamos que el proveedor existe y pertenece al cliente
    if (proveedorId) {
      const { data: proveedor, error: proveedorError } = await supabaseAdmin
        .from('proveedores')
        .select('id, activo, clienteId')
        .eq('id', proveedorId)
        .single()

      if (proveedorError || !proveedor) {
        return NextResponse.json(
          { error: 'Proveedor no encontrado' },
          { status: 404 }
        )
      }

      if (proveedor.clienteId !== clienteId) {
        return NextResponse.json(
          { error: 'El proveedor no pertenece a tu empresa' },
          { status: 403 }
        )
      }

      if (!proveedor.activo) {
        return NextResponse.json(
          { error: 'El proveedor está inactivo' },
          { status: 400 }
        )
      }
    }

    // Primero obtener los documentos completos para verificar todos los campos
    // Solo documentos que pertenezcan al cliente del usuario
    const { data: documentos, error: fetchError } = await supabaseAdmin
      .from('documentos')
      .select('id, clienteId, fechaEmision, total, letra, numeroCompleto, subtotal, iva')
      .in('id', documentoIds)
      .eq('clienteId', clienteId)

    if (fetchError) {
      console.error('Error fetching documents:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    if (!documentos || documentos.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron documentos válidos' },
        { status: 404 }
      )
    }

    // Actualizar cada documento evaluando su estado completo
    const updates = documentos.map(async (doc) => {
      // El documento con el nuevo proveedorId
      const docParaEvaluar = {
        clienteId: doc.clienteId,
        proveedorId: proveedorId || null,
        fechaEmision: doc.fechaEmision,
        total: doc.total,
        letra: doc.letra,
        numeroCompleto: doc.numeroCompleto,
        subtotal: doc.subtotal,
        iva: doc.iva,
      }

      // Evaluar estado y calcular campos faltantes
      const estadoRevision = determineEstadoRevision(docParaEvaluar)
      const missingFields = calculateMissingFields(docParaEvaluar)

      return supabaseAdmin
        .from('documentos')
        .update({
          proveedorId: proveedorId || null,
          estadoRevision,
          missingFields,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', doc.id)
        .select('id')
    })

    const results = await Promise.all(updates)

    // Verificar si hubo errores
    const errors = results.filter((r) => r.error)
    if (errors.length > 0) {
      console.error('Error updating documents:', errors)
      return NextResponse.json(
        { error: 'Failed to update some documents' },
        { status: 500 }
      )
    }

    const updatedDocs = results.map((r) => r.data?.[0]).filter(Boolean)

    return NextResponse.json({
      message: `${updatedDocs.length} documentos actualizados correctamente`,
      updatedCount: updatedDocs.length,
      documentoIds: updatedDocs.map((d) => d?.id).filter(Boolean),
    })
  } catch (error) {
    console.error('Error in bulk assign:', error)
    return NextResponse.json(
      { error: 'Failed to bulk assign proveedor' },
      { status: 500 }
    )
  }
}
