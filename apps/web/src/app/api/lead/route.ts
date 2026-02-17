import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const leadSchema = z.object({
  nombre: z.string().min(1, 'nombre requerido'),
  empresa: z.string().min(1, 'empresa requerida'),
  email: z.string().email('email invalido'),
  whatsapp: z.string().optional(),
  volumen: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const lead = leadSchema.parse(payload);

    // TODO: Conectar a proveedor real (CRM, Supabase, Resend o webhook) segun definicion comercial.
    console.log('[lead] Nuevo lead recibido', lead);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, errors: error.errors }, { status: 400 });
    }

    console.error('[lead] Error procesando lead', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
