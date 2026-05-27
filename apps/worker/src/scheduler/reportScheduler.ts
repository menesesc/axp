/**
 * Report Scheduler
 *
 * Loop simple cada 60s. Pega al endpoint /api/jobs/sales-reports/tick del web app
 * que tiene toda la lógica de evaluación e idempotencia. Esto evita duplicar
 * el código de envío (Resend, render del email, queries) en el worker.
 *
 * Env vars:
 *   SCHEDULER_API_URL  - URL base del web app (ej. https://axp.com.ar)
 *   SCHEDULER_TOKEN    - Bearer token compartido para autorizar el tick
 *   SCHEDULER_POLL_INTERVAL - ms entre ticks (default 60000)
 */

import { isShuttingDown } from '../index';

const API_URL = process.env.SCHEDULER_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const TOKEN = process.env.SCHEDULER_TOKEN;
const POLL_INTERVAL_MS = parseInt(process.env.SCHEDULER_POLL_INTERVAL || '60000', 10);

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [SCHEDULER] [${level.toUpperCase()}] ${msg}`;
  if (extra) console.log(line, extra);
  else console.log(line);
}

async function tick(): Promise<void> {
  const url = `${API_URL.replace(/\/$/, '')}/api/jobs/sales-reports/tick`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      // Mandamos la URL pública del web app: el endpoint la usa para armar
      // los links "Ver completo" del email. Sin esto, el web vería el origin
      // interno del contenedor y los links quedarían rotos.
      body: JSON.stringify({ baseUrl: API_URL }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log('error', `tick fallido: ${res.status}`, body.slice(0, 200));
      return;
    }
    const body = (await res.json()) as {
      evaluated: number;
      results: Array<{ action: string; subscriptionId: string; status?: string; error?: string }>;
    };
    const sent = body.results.filter((r) => r.action === 'sent').length;
    const fail = body.results.filter((r) => r.action === 'fail').length;
    if (sent > 0 || fail > 0) {
      log('info', `tick: ${body.evaluated} subs evaluadas, ${sent} enviadas, ${fail} fallos`);
      for (const r of body.results) {
        if (r.action === 'sent') log('info', `  → ${r.subscriptionId} OK (${r.status ?? 'sin status'})`);
        if (r.action === 'fail') log('warn', `  → ${r.subscriptionId} FAIL: ${r.error ?? 'sin detalle'}`);
      }
    }
  } catch (err) {
    log('error', `excepción en tick: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function startScheduler(): Promise<void> {
  if (!TOKEN) {
    log('error', 'SCHEDULER_TOKEN no configurado. Aborto.');
    process.exit(1);
  }
  log('info', `iniciando scheduler. URL=${API_URL} intervalo=${POLL_INTERVAL_MS}ms`);

  // Primer tick inmediato (útil para tests).
  await tick();

  // Loop con intervalo.
  while (!isShuttingDown) {
    await sleep(POLL_INTERVAL_MS);
    if (isShuttingDown) break;
    await tick();
  }
  log('info', 'scheduler detenido');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
