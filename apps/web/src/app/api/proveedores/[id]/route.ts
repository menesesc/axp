import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { determineEstadoRevision, calculateMissingFields } from '@/lib/documento-estado';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Obtener proveedor por ID
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: proveedor, error } = await supabase
      .from('proveedores')
      .select(`
        *,
        documentos:documentos(count)
      `)
      .eq('id', params.id)
      .single();

    if (error || !proveedor) {
      return NextResponse.json(
        { error: 'Proveedor not found' },
        { status: 404 }
      );
    }

    const formattedProveedor = {
      ...proveedor,
      _count: {
        documentos: proveedor.documentos?.[0]?.count || 0
      }
    };

    return NextResponse.json({ proveedor: formattedProveedor });
  } catch (error) {
    console.error('Error fetching proveedor:', error);
    return NextResponse.json(
      { error: 'Failed to fetch proveedor' },
      { status: 500 }
    );
  }
}

// PATCH: Actualizar proveedor
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { razonSocial, cuit, alias, letra, activo } = body;

    // Validar letra si se proporciona
    if (letra !== undefined && letra !== null && !['A', 'B', 'C'].includes(letra)) {
      return NextResponse.json(
        { error: 'Letra debe ser A, B o C' },
        { status: 400 }
      );
    }

    // Verificar que el proveedor existe
    const { data: existing, error: existingError } = await supabase
      .from('proveedores')
      .select('*')
      .eq('id', params.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Proveedor not found' },
        { status: 404 }
      );
    }

    // Verificar si ya existe otro proveedor con el mismo CUIT
    if (cuit && cuit !== existing.cuit) {
      const { data: existingByCuit } = await supabase
        .from('proveedores')
        .select('id')
        .eq('clienteId', existing.clienteId)
        .eq('cuit', cuit)
        .neq('id', params.id)
        .maybeSingle();

      if (existingByCuit) {
        return NextResponse.json(
          { error: `Ya existe otro proveedor con CUIT ${cuit}` },
          { status: 409 }
        );
      }
    }

    // Verificar si ya existe otro proveedor con la misma razón social
    if (razonSocial && razonSocial.toLowerCase() !== existing.razonSocial.toLowerCase()) {
      const { data: existingByName } = await supabase
        .from('proveedores')
        .select('id')
        .eq('clienteId', existing.clienteId)
        .ilike('razonSocial', razonSocial)
        .neq('id', params.id)
        .maybeSingle();

      if (existingByName) {
        return NextResponse.json(
          { error: `Ya existe otro proveedor con razón social "${razonSocial}"` },
          { status: 409 }
        );
      }
    }

    // Actualizar proveedor
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (razonSocial !== undefined) updateData.razonSocial = razonSocial;
    if (cuit !== undefined) updateData.cuit = cuit;
    if (alias !== undefined) updateData.alias = alias;
    if (letra !== undefined) updateData.letra = letra;
    if (activo !== undefined) updateData.activo = activo;

    const { data: proveedor, error: updateError } = await supabase
      .from('proveedores')
      .update(updateData)
      .eq('id', params.id)
      .select(`
        *,
        documentos:documentos(count)
      `)
      .single();

    if (updateError) {
      console.error('Error updating proveedor:', updateError);
      return NextResponse.json(
        { error: 'Failed to update proveedor' },
        { status: 500 }
      );
    }

    const formattedProveedor = {
      ...proveedor,
      _count: {
        documentos: proveedor.documentos?.[0]?.count || 0
      }
    };

    return NextResponse.json({ proveedor: formattedProveedor });
  } catch (error) {
    console.error('Error updating proveedor:', error);
    return NextResponse.json(
      { error: 'Failed to update proveedor' },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar proveedor
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verificar que el proveedor existe y contar documentos
    const { data: proveedor, error: proveedorError } = await supabase
      .from('proveedores')
      .select(`
        *,
        documentos:documentos(count)
      `)
      .eq('id', params.id)
      .single();

    if (proveedorError || !proveedor) {
      return NextResponse.json(
        { error: 'Proveedor not found' },
        { status: 404 }
      );
    }

    const documentCount = proveedor.documentos?.[0]?.count || 0;

    // Si tiene documentos, desasociarlos antes de eliminar
    if (documentCount > 0) {
      // Primero obtener los documentos completos para evaluar su estado
      const { data: documentos, error: fetchDocsError } = await supabase
        .from('documentos')
        .select('id, clienteId, fechaEmision, total, letra, numeroCompleto, subtotal, iva')
        .eq('proveedorId', params.id);

      if (fetchDocsError) {
        console.error('Error fetching documents:', fetchDocsError);
        return NextResponse.json(
          { error: 'Failed to fetch associated documents' },
          { status: 500 }
        );
      }

      // Actualizar cada documento evaluando su estado sin proveedor
      const updates = documentos?.map(async (doc) => {
        const docParaEvaluar = {
          clienteId: doc.clienteId,
          proveedorId: null, // Se va a quitar el proveedor
          fechaEmision: doc.fechaEmision,
          total: doc.total,
          letra: doc.letra,
          numeroCompleto: doc.numeroCompleto,
          subtotal: doc.subtotal,
          iva: doc.iva,
        };

        // Evaluar estado y calcular campos faltantes
        const estadoRevision = determineEstadoRevision(docParaEvaluar);
        const missingFields = calculateMissingFields(docParaEvaluar);

        return supabase
          .from('documentos')
          .update({
            proveedorId: null,
            estadoRevision,
            missingFields,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', doc.id);
      });

      const results = await Promise.all(updates || []);
      const errors = results.filter(r => r.error);
      
      if (errors.length > 0) {
        console.error('Error updating documents:', errors);
        return NextResponse.json(
          { error: 'Failed to update associated documents' },
          { status: 500 }
        );
      }
    }

    // Si no tiene documentos, eliminar completamente
    const { error: deleteError } = await supabase
      .from('proveedores')
      .delete()
      .eq('id', params.id);

    if (deleteError) {
      console.error('Error deleting proveedor:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete proveedor' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Proveedor eliminado',
      softDelete: false,
    });
  } catch (error) {
    console.error('Error deleting proveedor:', error);
    return NextResponse.json(
      { error: 'Failed to delete proveedor' },
      { status: 500 }
    );
  }
}
