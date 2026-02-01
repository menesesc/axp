import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  determineEstadoRevision,
  calculateMissingFields,
} from '@/lib/documento-estado'
import { getAuthUser, requireAdmin } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Obtener proveedor por ID
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser()
    if (authError) return authError

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const { id } = await params

    const { data: proveedor, error } = await supabaseAdmin
      .from('proveedores')
      .select(
        `
        *,
        documentos:documentos(count)
      `
      )
      .eq('id', id)
      .eq('clienteId', clienteId)
      .single()

    if (error || !proveedor) {
      return NextResponse.json(
        { error: 'Proveedor not found' },
        { status: 404 }
      )
    }

    const formattedProveedor = {
      ...proveedor,
      documentosCount: proveedor.documentos?.[0]?.count || 0,
    }

    return NextResponse.json({ proveedor: formattedProveedor })
  } catch (error) {
    console.error('Error fetching proveedor:', error)
    return NextResponse.json(
      { error: 'Failed to fetch proveedor' },
      { status: 500 }
    )
  }
}

// PATCH: Actualizar proveedor
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await requireAdmin()
    if (authError) return authError

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { razonSocial, cuit, alias, letra, activo } = body

    // Validar letra si se proporciona
    if (
      letra !== undefined &&
      letra !== null &&
      !['A', 'B', 'C'].includes(letra)
    ) {
      return NextResponse.json(
        { error: 'Letra debe ser A, B o C' },
        { status: 400 }
      )
    }

    // Verificar que el proveedor existe y pertenece al cliente
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('proveedores')
      .select('*')
      .eq('id', id)
      .eq('clienteId', clienteId)
      .single()

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Proveedor not found' },
        { status: 404 }
      )
    }

    // Verificar si ya existe otro proveedor con el mismo CUIT
    if (cuit && cuit !== existing.cuit) {
      const { data: existingByCuit } = await supabaseAdmin
        .from('proveedores')
        .select('id')
        .eq('clienteId', clienteId)
        .eq('cuit', cuit)
        .neq('id', id)
        .maybeSingle()

      if (existingByCuit) {
        return NextResponse.json(
          { error: `Ya existe otro proveedor con CUIT ${cuit}` },
          { status: 409 }
        )
      }
    }

    // Verificar si ya existe otro proveedor con la misma razón social
    if (
      razonSocial &&
      razonSocial.toLowerCase() !== existing.razonSocial.toLowerCase()
    ) {
      const { data: existingByName } = await supabaseAdmin
        .from('proveedores')
        .select('id')
        .eq('clienteId', clienteId)
        .ilike('razonSocial', razonSocial)
        .neq('id', id)
        .maybeSingle()

      if (existingByName) {
        return NextResponse.json(
          {
            error: `Ya existe otro proveedor con razón social "${razonSocial}"`,
          },
          { status: 409 }
        )
      }
    }

    // Actualizar proveedor
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    }

    if (razonSocial !== undefined) updateData.razonSocial = razonSocial
    if (cuit !== undefined) updateData.cuit = cuit
    if (alias !== undefined) updateData.alias = alias
    if (letra !== undefined) updateData.letra = letra
    if (activo !== undefined) updateData.activo = activo

    const { data: proveedor, error: updateError } = await supabaseAdmin
      .from('proveedores')
      .update(updateData)
      .eq('id', id)
      .select(
        `
        *,
        documentos:documentos(count)
      `
      )
      .single()

    if (updateError) {
      console.error('Error updating proveedor:', updateError)
      return NextResponse.json(
        { error: 'Failed to update proveedor' },
        { status: 500 }
      )
    }

    const formattedProveedor = {
      ...proveedor,
      documentosCount: proveedor.documentos?.[0]?.count || 0,
    }

    return NextResponse.json({ proveedor: formattedProveedor })
  } catch (error) {
    console.error('Error updating proveedor:', error)
    return NextResponse.json(
      { error: 'Failed to update proveedor' },
      { status: 500 }
    )
  }
}

// DELETE: Eliminar proveedor
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await requireAdmin()
    if (authError) return authError

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const { id } = await params

    // Verificar que el proveedor existe, pertenece al cliente, y contar documentos
    const { data: proveedor, error: proveedorError } = await supabaseAdmin
      .from('proveedores')
      .select(
        `
        *,
        documentos:documentos(count)
      `
      )
      .eq('id', id)
      .eq('clienteId', clienteId)
      .single()

    if (proveedorError || !proveedor) {
      return NextResponse.json(
        { error: 'Proveedor not found' },
        { status: 404 }
      )
    }

    const documentCount = proveedor.documentos?.[0]?.count || 0

    // Si tiene documentos, desasociarlos antes de eliminar
    if (documentCount > 0) {
      const { data: documentos, error: fetchDocsError } = await supabaseAdmin
        .from('documentos')
        .select(
          'id, clienteId, fechaEmision, total, letra, numeroCompleto, subtotal, iva'
        )
        .eq('proveedorId', id)

      if (fetchDocsError) {
        console.error('Error fetching documents:', fetchDocsError)
        return NextResponse.json(
          { error: 'Failed to fetch associated documents' },
          { status: 500 }
        )
      }

      // Actualizar cada documento evaluando su estado sin proveedor
      const updates = documentos?.map(async (doc) => {
        const docParaEvaluar = {
          clienteId: doc.clienteId,
          proveedorId: null,
          fechaEmision: doc.fechaEmision,
          total: doc.total,
          letra: doc.letra,
          numeroCompleto: doc.numeroCompleto,
          subtotal: doc.subtotal,
          iva: doc.iva,
        }

        const estadoRevision = determineEstadoRevision(docParaEvaluar)
        const missingFields = calculateMissingFields(docParaEvaluar)

        return supabaseAdmin
          .from('documentos')
          .update({
            proveedorId: null,
            estadoRevision,
            missingFields,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', doc.id)
      })

      const results = await Promise.all(updates || [])
      const errors = results.filter((r) => r.error)

      if (errors.length > 0) {
        console.error('Error updating documents:', errors)
        return NextResponse.json(
          { error: 'Failed to update associated documents' },
          { status: 500 }
        )
      }
    }

    // Eliminar el proveedor
    const { error: deleteError } = await supabaseAdmin
      .from('proveedores')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting proveedor:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete proveedor' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Proveedor eliminado',
      softDelete: false,
    })
  } catch (error) {
    console.error('Error deleting proveedor:', error)
    return NextResponse.json(
      { error: 'Failed to delete proveedor' },
      { status: 500 }
    )
  }
}
