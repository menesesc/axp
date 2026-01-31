import { NextRequest, NextResponse } from 'next/server';

// Store de notificaciones en memoria (en producción usar Redis o similar)
const notifications = new Map<string, any[]>();

// GET: Server-Sent Events para notificaciones en tiempo real
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clienteId = searchParams.get('clienteId');

  if (!clienteId) {
    return NextResponse.json({ error: 'clienteId required' }, { status: 400 });
  }

  // Configurar SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Enviar comentario inicial para mantener conexión
      controller.enqueue(encoder.encode(': keepalive\n\n'));

      // Enviar notificaciones pendientes
      const pending = notifications.get(clienteId) || [];
      if (pending.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ notifications: pending })}\n\n`)
        );
        notifications.delete(clienteId);
      }

      // Keepalive cada 30 segundos
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch (error) {
          clearInterval(interval);
        }
      }, 30000);

      // Cleanup al cerrar
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// POST: Enviar notificación de nuevo documento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clienteId, documentoId, tipo = 'new_document' } = body;

    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId required' }, { status: 400 });
    }

    // Guardar notificación
    const clientNotifications = notifications.get(clienteId) || [];
    clientNotifications.push({
      type: tipo,
      documentoId,
      timestamp: new Date().toISOString(),
    });
    notifications.set(clienteId, clientNotifications);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
