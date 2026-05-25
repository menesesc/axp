# Módulo Sales (Cierres de Caja Maxirest)

Procesa automáticamente los cierres de caja del POS gastronómico **Maxirest**
que llegan por email como PDF adjunto, y los expone vía API para reportes y
dashboards en `/ventas`.

## Flujo

```
Maxirest (POS) → fdtmaxisistemas@gmail.com → envía PDF
        │
        ▼
maxirest@axp.com.ar  (alias en Resend, dominio axp.com.ar)
        │ webhook Svix
        ▼
POST /api/email/inbound
        │ detecta sender Maxirest → rama isMaxirestSender()
        ▼
ingestMaxirestPdf(buffer)
   1. pdf-parse → texto plano
   2. parseMaxirestClosure(text) → estructura tipada
   3. lookup cliente por CUIT del PDF (clientes.cuit)
   4. upsert sales_closures (idempotente por clienteId+fecha+nroCierre)
   5. bulk insert hijas (payments, items, waiters, movements)
   6. upload PDF a R2 → inbox/maxirest/{fecha}_t{turno}_c{cierre}.pdf
```

## Identificación de cliente

- **Sender**: solo `fdtmaxisistemas@gmail.com` (set `MAXIREST_SENDERS`)
- **Cliente**: por **CUIT del PDF** (`clientes.cuit` debe coincidir, normalizado sin guiones)
- Si no hay match: PDF se guarda en `R2_UNRESOLVED_BUCKET/unresolved/maxirest/`
  y se devuelve `status: NO_CLIENT` sin error

## Idempotencia

`sales_closures` tiene unique `(clienteId, fecha, nroCierre)`. Reenviar el
mismo PDF actualiza el cierre y reemplaza todas las hijas (no duplica).

## Modelos Prisma

| Modelo | Para qué |
|---|---|
| `sales_closures` | Cierre maestro: 1 por turno/día/sucursal |
| `sales_closure_payments` | Formas de cobro (Efectivo, Visa, MP, etc.) |
| `sales_closure_items` | Productos vendidos (con FK a `sales_product_master`) |
| `sales_closure_waiters` | Ventas por mozo |
| `sales_closure_movements` | Movimientos de caja (propinas, saldos) |
| `sales_product_master` | Catálogo de productos por cliente (se pobla solo) |
| `sales_recipes` + `sales_recipe_items` | Recetas/BOM para futuro costeo (sin UI todavía) |

## Endpoints

- `GET /api/sales/closures` — listado paginado con filtros (from, to, turno, sucursal)
- `GET /api/sales/closures/[id]` — detalle (payments + items + waiters + movements)
- `POST /api/sales/closures/upload` — upload manual de PDF (multipart `file`)
- `DELETE /api/sales/closures/[id]` — borrar cierre (solo admin)
- `GET /api/sales/ranking?groupBy=item|rubro` — top productos/rubros
- `GET /api/sales/waiters` — ranking mozos
- `GET /api/sales/payments` — distribución por forma de cobro
- `GET /api/sales/by-shift` — series diarias almuerzo vs cena

Todos requieren `clienteId` del usuario autenticado (multi-tenant).

## Setup Resend

1. En Resend Dashboard → **Domains**: agregar `axp.com.ar` (ya configurado)
2. **Inbound** → crear ruta `maxirest@axp.com.ar` → forward webhook a
   `https://{tu-dominio}/api/email/inbound`
3. Copiar el **Signing Secret** del webhook (formato `whsec_...`) a la env var
   `RESEND_WEBHOOK_SECRET`
4. Instruir al restaurante: configurar Maxirest para enviar cierres a
   `maxirest@axp.com.ar`

## Testing

```bash
# Tests del parser (con fixture y con PDF real)
bun test apps/web/src/lib/sales/__tests__/

# Probar ingest contra DB real (necesita DATABASE_URL configurada)
# Ver /tmp/test-ingest.ts como ejemplo
```

## Troubleshooting

- **`NO_CLIENT`** en logs: verificar que `clientes.cuit` (sin guiones, 11
  dígitos) coincide con el CUIT del PDF. La columna es `VARCHAR(11) UNIQUE`.
- **`PARSE_ERROR`** con "No se encontró CUIT" / "No se encontró número de
  cierre": el formato del PDF Maxirest cambió. Mirar `maxirest-parser.ts`
  y actualizar regex. El `rawText` se guarda en `sales_closures.rawText`
  para re-parsing post-fix.
- **Timeout de transacción** al ingerir: cierres con muchos artículos pueden
  tardar. El timeout está en 60s y usamos bulk inserts. Si persiste,
  revisar `connection_limit` del DATABASE_URL.
- **Diferencias entre fixture y PDF real**: pdf-parse a veces mapea
  caracteres erróneamente. El parser tolera `(`/`[`, `º`/`|`, etc.

## Próximos pasos (Fase 7 — Recetas)

UI para asociar productos vendidos con items de compra:
- Cada `sales_product_master` puede tener una receta (`sales_recipes`)
- Cada receta tiene ingredientes (`sales_recipe_items` con `cantidad` + `unidad`)
- Permitirá calcular: costo teórico por plato, consumo proyectado en kg,
  comparativa vs compras reales (mermas)

El schema ya está listo; falta UI y endpoints.
