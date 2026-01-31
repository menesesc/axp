import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Listar proveedores
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get('clienteId');

    if (!clienteId) {
      return NextResponse.json(
        { error: 'clienteId is required' },
        { status: 400 }
      );
    }

    // Obtener proveedores con conteo de documentos
    const { data: proveedores, error } = await supabase
      .from('proveedores')
      .select(`
        *,
        documentos:documentos(count)
      `)
      .eq('clienteId', clienteId)
      .order('razonSocial', { ascending: true });

    if (error) {
      console.error('Error fetching proveedores:', error);
      return NextResponse.json(
        { error: 'Failed to fetch proveedores' },
        { status: 500 }
      );
    }

    // Transformar la respuesta para que coincida con el formato esperado
    const formattedProveedores = proveedores?.map(p => ({
      ...p,
      _count: {
        documentos: p.documentos?.[0]?.count || 0
      }
    })) || [];

    return NextResponse.json({ proveedores: formattedProveedores });
  } catch (error) {
    console.error('Error fetching proveedores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch proveedores' },
      { status: 500 }
    );
  }
}

// POST: Crear proveedor
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { clienteId, razonSocial, cuit, alias, letra } = body;

    if (!clienteId || !razonSocial) {
      return NextResponse.json(
        { error: 'clienteId and razonSocial are required' },
        { status: 400 }
      );
    }

    // Validar letra si se proporciona
    if (letra && !['A', 'B', 'C'].includes(letra)) {
      return NextResponse.json(
        { error: 'Letra debe ser A, B o C' },
        { status: 400 }
      );
    }

    // Limpiar y validar CUIT (remover guiones, espacios, etc.)
    if (cuit) {
      cuit = cuit.replace(/[-\s]/g, ''); // Remover guiones y espacios
      
      // Validar que solo tenga dígitos
      if (!/^\d+$/.test(cuit)) {
        return NextResponse.json(
          { error: 'CUIT debe contener solo números' },
          { status: 400 }
        );
      }
      
      // Validar longitud (debe ser 11 dígitos)
      if (cuit.length !== 11) {
        return NextResponse.json(
          { error: `CUIT debe tener 11 dígitos (recibido: ${cuit.length})` },
          { status: 400 }
        );
      }
    }

    // Verificar que el cliente existe
    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('id')
      .eq('id', clienteId)
      .single();

    if (clienteError || !cliente) {
      return NextResponse.json(
        { error: 'Cliente not found' },
        { status: 404 }
      );
    }

    // Verificar si ya existe por CUIT
    if (cuit) {
      const { data: existingByCuit } = await supabase
        .from('proveedores')
        .select('id')
        .eq('clienteId', clienteId)
        .eq('cuit', cuit)
        .single();

      if (existingByCuit) {
        return NextResponse.json(
          { error: `Ya existe un proveedor con CUIT ${cuit}` },
          { status: 409 }
        );
      }
    }

    // Verificar si ya existe por razón social (case insensitive)
    const { data: existingByName } = await supabase
      .from('proveedores')
      .select('id')
      .eq('clienteId', clienteId)
      .ilike('razonSocial', razonSocial)
      .single();

    if (existingByName) {
      return NextResponse.json(
        { error: `Ya existe un proveedor con razón social "${razonSocial}"` },
        { status: 409 }
      );
    }

    // Crear proveedor
    const proveedorId = crypto.randomUUID();
    const { data: proveedor, error: createError } = await supabase
      .from('proveedores')
      .insert({
        id: proveedorId,
        clienteId,
        razonSocial,
        cuit: cuit || null,
        alias: alias || [],
        letra: letra || null,
        activo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating proveedor:', createError);
      return NextResponse.json(
        { error: 'Failed to create proveedor' },
        { status: 500 }
      );
    }

    // Agregar el conteo de documentos
    const proveedorWithCount = {
      ...proveedor,
      _count: {
        documentos: 0
      }
    };

    return NextResponse.json({ proveedor: proveedorWithCount }, { status: 201 });
  } catch (error) {
    console.error('Error creating proveedor:', error);
    return NextResponse.json(
      { error: 'Failed to create proveedor' },
      { status: 500 }
    );
  }
}
