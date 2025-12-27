/**
 * Schemas de validación con Zod
 * Sincronizados con Prisma schema de AXP
 */
import { z } from 'zod';

// ============================================================================
// ENUM SCHEMAS
// ============================================================================

export const rolUsuarioSchema = z.enum(['SUPERADMIN', 'ADMIN', 'USER']);
export const tipoDocumentoSchema = z.enum(['FACTURA', 'REMITO', 'NOTA_CREDITO']);
export const letraFacturaSchema = z.enum(['A', 'B', 'C']);
export const estadoRevisionSchema = z.enum(['PENDIENTE', 'CONFIRMADO', 'ERROR', 'DUPLICADO']);
export const sourceDocumentoSchema = z.enum(['SFTP', 'DRIVE', 'MANUAL']);
export const accionRevisionSchema = z.enum(['SET_FIELD', 'SET_PROVIDER', 'EDIT_ITEM', 'CONFIRM']);
export const estadoPagoSchema = z.enum(['BORRADOR', 'PAGADO', 'ANULADO']);
export const tipoPagoMetodoSchema = z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE']);
export const statusIngestQueueSchema = z.enum(['PENDING', 'PROCESSING', 'DONE', 'ERROR']);

// ============================================================================
// CLIENTE
// ============================================================================

export const clienteSchema = z.object({
  id: z.string().uuid(),
  razonSocial: z.string().min(1, 'Razón social requerida').max(255),
  cuit: z.string().regex(/^\d{11}$/, 'CUIT debe tener 11 dígitos'),
  r2Prefix: z.string().min(1),
  activo: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const crearClienteSchema = z.object({
  razonSocial: z.string().min(1).max(255),
  cuit: z.string().regex(/^\d{11}$/, 'CUIT debe tener 11 dígitos'),
  r2Prefix: z.string().min(1).max(50),
});

export const actualizarClienteSchema = crearClienteSchema.partial();

// ============================================================================
// USUARIO
// ============================================================================

export const usuarioSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nombre: z.string().min(1).max(255),
  rol: rolUsuarioSchema,
  clienteId: z.string().uuid().nullable(),
  activo: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const crearUsuarioSchema = z
  .object({
    email: z.string().email('Email inválido'),
    nombre: z.string().min(2, 'Nombre debe tener al menos 2 caracteres'),
    rol: rolUsuarioSchema,
    clienteId: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      // SUPERADMIN no debe tener clienteId
      if (data.rol === 'SUPERADMIN') return !data.clienteId;
      // ADMIN y USER deben tener clienteId
      return !!data.clienteId;
    },
    { message: 'SUPERADMIN no debe tener clienteId. ADMIN/USER deben tenerlo.' }
  );

export const actualizarUsuarioSchema = z.object({
  nombre: z.string().min(2).optional(),
  email: z.string().email().optional(),
  activo: z.boolean().optional(),
});

// ============================================================================
// PROVEEDOR
// ============================================================================

export const proveedorSchema = z.object({
  id: z.string().uuid(),
  clienteId: z.string().uuid(),
  razonSocial: z.string().min(1).max(255),
  cuit: z.string().regex(/^\d{11}$/).nullable(),
  alias: z.array(z.string()),
  activo: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const crearProveedorSchema = z.object({
  clienteId: z.string().uuid(),
  razonSocial: z.string().min(1, 'Razón social requerida').max(255),
  cuit: z.string().regex(/^\d{11}$/, 'CUIT debe tener 11 dígitos').optional(),
  alias: z.array(z.string()).default([]),
});

export const actualizarProveedorSchema = crearProveedorSchema
  .omit({ clienteId: true })
  .partial();

// ============================================================================
// DOCUMENTO
// ============================================================================

export const documentoSchema = z.object({
  id: z.string().uuid(),
  clienteId: z.string().uuid(),
  proveedorId: z.string().uuid().nullable(),
  tipo: tipoDocumentoSchema,
  letra: letraFacturaSchema.nullable(),
  puntoVenta: z.string().max(10).nullable(),
  numero: z.string().max(20).nullable(),
  numeroCompleto: z.string().max(50).nullable(),
  fechaEmision: z.date().nullable(),
  fechaVencimiento: z.date().nullable(),
  moneda: z.string().length(3).default('ARS'),
  subtotal: z.number().nullable(),
  iva: z.number().nullable(),
  total: z.number().nullable(),
  confidenceScore: z.number().int().min(0).max(100).nullable(),
  estadoRevision: estadoRevisionSchema,
  missingFields: z.array(z.string()),
  jsonNormalizado: z.record(z.unknown()),
  source: sourceDocumentoSchema,
  hashSha256: z.string().length(64),
  pdfRawKey: z.string().max(500),
  pdfFinalKey: z.string().max(500).nullable(),
  textractRawKey: z.string().max(500).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const crearDocumentoSchema = z.object({
  clienteId: z.string().uuid(),
  tipo: tipoDocumentoSchema,
  source: sourceDocumentoSchema,
  hashSha256: z.string().length(64, 'Hash SHA256 debe tener 64 caracteres'),
  pdfRawKey: z.string().min(1, 'Key de R2 requerida'),
  jsonNormalizado: z.record(z.unknown()).optional(),
});

export const actualizarDocumentoSchema = z.object({
  proveedorId: z.string().uuid().optional(),
  letra: letraFacturaSchema.optional(),
  puntoVenta: z.string().max(10).optional(),
  numero: z.string().max(20).optional(),
  fechaEmision: z.date().optional(),
  fechaVencimiento: z.date().optional(),
  subtotal: z.number().optional(),
  iva: z.number().optional(),
  total: z.number().optional(),
  estadoRevision: estadoRevisionSchema.optional(),
});

// ============================================================================
// DOCUMENTO ITEM
// ============================================================================

export const documentoItemSchema = z.object({
  id: z.string().uuid(),
  documentoId: z.string().uuid(),
  linea: z.number().int().positive(),
  descripcion: z.string().min(1),
  codigo: z.string().max(100).nullable(),
  cantidad: z.number().nullable(),
  unidad: z.string().max(20).nullable(),
  precioUnitario: z.number().nullable(),
  subtotal: z.number().nullable(),
});

export const crearDocumentoItemSchema = documentoItemSchema
  .omit({ id: true, documentoId: true })
  .extend({
    documentoId: z.string().uuid(),
  });

// ============================================================================
// PAGO
// ============================================================================

export const pagoSchema = z.object({
  id: z.string().uuid(),
  clienteId: z.string().uuid(),
  proveedorId: z.string().uuid(),
  fecha: z.date(),
  estado: estadoPagoSchema,
  moneda: z.string().length(3),
  montoTotal: z.number().positive(),
  nota: z.string().nullable(),
  comprobanteKey: z.string().max(500).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const crearPagoSchema = z.object({
  clienteId: z.string().uuid(),
  proveedorId: z.string().uuid(),
  fecha: z.date(),
  montoTotal: z.number().positive('Monto debe ser positivo'),
  moneda: z.string().length(3).default('ARS'),
  nota: z.string().optional(),
  metodos: z
    .array(
      z.object({
        tipo: tipoPagoMetodoSchema,
        monto: z.number().positive(),
        meta: z.record(z.unknown()).optional(),
      })
    )
    .min(1, 'Debe tener al menos un método de pago'),
  documentos: z
    .array(
      z.object({
        documentoId: z.string().uuid(),
        montoAplicado: z.number().positive(),
      })
    )
    .optional(),
});

// ============================================================================
// INGEST QUEUE
// ============================================================================

export const ingestQueueSchema = z.object({
  id: z.string().uuid(),
  clienteId: z.string().uuid(),
  source: z.enum(['SFTP', 'DRIVE']),
  sourceRef: z.string().max(500),
  sha256: z.string().length(64).nullable(),
  status: statusIngestQueueSchema,
  attempts: z.number().int().min(0),
  nextRetryAt: z.date().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const crearIngestQueueSchema = z.object({
  clienteId: z.string().uuid(),
  source: z.enum(['SFTP', 'DRIVE']),
  sourceRef: z.string().min(1, 'Referencia de source requerida'),
  sha256: z.string().length(64).optional(),
});

// ============================================================================
// BÚSQUEDA Y FILTROS
// ============================================================================

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});

export const documentoQuerySchema = paginationSchema.extend({
  clienteId: z.string().uuid(),
  tipo: tipoDocumentoSchema.optional(),
  estadoRevision: estadoRevisionSchema.optional(),
  proveedorId: z.string().uuid().optional(),
  fechaDesde: z.date().optional(),
  fechaHasta: z.date().optional(),
  search: z.string().optional(), // Búsqueda full-text
});

export const proveedorQuerySchema = paginationSchema.extend({
  clienteId: z.string().uuid(),
  search: z.string().optional(),
  activo: z.boolean().optional(),
});

export const pagoQuerySchema = paginationSchema.extend({
  clienteId: z.string().uuid(),
  proveedorId: z.string().uuid().optional(),
  estado: estadoPagoSchema.optional(),
  fechaDesde: z.date().optional(),
  fechaHasta: z.date().optional(),
});
