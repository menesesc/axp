/**
 * Types compartidos entre todos los workspaces
 * Sincronizados con schema Prisma de AXP
 */

// ============================================================================
// ENUMS (sincronizados con Prisma)
// ============================================================================

export enum RolUsuario {
  SUPERADMIN = 'SUPERADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum TipoDocumento {
  FACTURA = 'FACTURA',
  REMITO = 'REMITO',
  NOTA_CREDITO = 'NOTA_CREDITO',
}

export enum LetraFactura {
  A = 'A',
  B = 'B',
  C = 'C',
}

export enum EstadoRevision {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADO = 'CONFIRMADO',
  ERROR = 'ERROR',
  DUPLICADO = 'DUPLICADO',
}

export enum SourceDocumento {
  SFTP = 'SFTP',
  DRIVE = 'DRIVE',
  MANUAL = 'MANUAL',
}

export enum AccionRevision {
  SET_FIELD = 'SET_FIELD',
  SET_PROVIDER = 'SET_PROVIDER',
  EDIT_ITEM = 'EDIT_ITEM',
  CONFIRM = 'CONFIRM',
}

export enum EstadoPago {
  BORRADOR = 'BORRADOR',
  PAGADO = 'PAGADO',
  ANULADO = 'ANULADO',
}

export enum TipoPagoMetodo {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  CHEQUE = 'CHEQUE',
}

export enum StatusIngestQueue {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  ERROR = 'ERROR',
}

export enum SourceIngestQueue {
  SFTP = 'SFTP',
  DRIVE = 'DRIVE',
}

// ============================================================================
// DOMAIN TYPES (basados en Prisma models)
// ============================================================================

// Cliente (Multi-tenant root)
export interface Cliente {
  id: string;
  razonSocial: string;
  cuit: string;
  r2Prefix: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Usuario con roles
export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  clienteId: string | null; // NULL solo para SUPERADMIN
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Proveedor (consolidación OCR)
export interface Proveedor {
  id: string;
  clienteId: string;
  razonSocial: string;
  cuit: string | null;
  alias: string[]; // Variaciones de nombre del OCR
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Documento (Factura, Remito, NC)
export interface Documento {
  id: string;
  clienteId: string;
  proveedorId: string | null;
  tipo: TipoDocumento;
  letra: LetraFactura | null;
  puntoVenta: string | null;
  numero: string | null;
  numeroCompleto: string | null;
  fechaEmision: Date | null;
  fechaVencimiento: Date | null;
  moneda: string;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  confidenceScore: number | null;
  estadoRevision: EstadoRevision;
  missingFields: string[];
  jsonNormalizado: Record<string, unknown>;
  source: SourceDocumento;
  hashSha256: string;
  pdfRawKey: string;
  pdfFinalKey: string | null;
  textractRawKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Documento Item
export interface DocumentoItem {
  id: string;
  documentoId: string;
  linea: number;
  descripcion: string;
  codigo: string | null;
  cantidad: number | null;
  unidad: string | null;
  precioUnitario: number | null;
  subtotal: number | null;
}

// Documento Revision (auditoría)
export interface DocumentoRevision {
  id: string;
  documentoId: string;
  usuarioId: string;
  accion: AccionRevision;
  path: string;
  before: unknown | null;
  after: unknown | null;
  createdAt: Date;
}

// Pago
export interface Pago {
  id: string;
  clienteId: string;
  proveedorId: string;
  fecha: Date;
  estado: EstadoPago;
  moneda: string;
  montoTotal: number;
  nota: string | null;
  comprobanteKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Pago Método
export interface PagoMetodo {
  id: string;
  pagoId: string;
  tipo: TipoPagoMetodo;
  monto: number;
  meta: Record<string, unknown>;
}

// Pago Documento (aplicación)
export interface PagoDocumento {
  pagoId: string;
  documentoId: string;
  montoAplicado: number;
  createdAt: Date;
}

// Ingest Queue
export interface IngestQueue {
  id: string;
  clienteId: string;
  source: SourceIngestQueue;
  sourceRef: string;
  sha256: string | null;
  status: StatusIngestQueue;
  attempts: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// API TYPES
// ============================================================================

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// EXTENDED TYPES (con relaciones)
// ============================================================================

export interface DocumentoConRelaciones extends Documento {
  proveedor?: Proveedor;
  items?: DocumentoItem[];
  revisiones?: DocumentoRevision[];
}

export interface PagoConRelaciones extends Pago {
  proveedor?: Proveedor;
  metodos?: PagoMetodo[];
  documentos?: Array<PagoDocumento & { documento?: Documento }>;
}

// ============================================================================
// DTOs para crear/actualizar
// ============================================================================

export interface CrearDocumentoDTO {
  clienteId: string;
  tipo: TipoDocumento;
  source: SourceDocumento;
  hashSha256: string;
  pdfRawKey: string;
  jsonNormalizado?: Record<string, unknown>;
}

export interface ActualizarDocumentoDTO {
  proveedorId?: string;
  letra?: LetraFactura;
  puntoVenta?: string;
  numero?: string;
  fechaEmision?: Date;
  fechaVencimiento?: Date;
  subtotal?: number;
  iva?: number;
  total?: number;
  estadoRevision?: EstadoRevision;
}

export interface CrearPagoDTO {
  clienteId: string;
  proveedorId: string;
  fecha: Date;
  montoTotal: number;
  moneda?: string;
  metodos: Array<{
    tipo: TipoPagoMetodo;
    monto: number;
    meta?: Record<string, unknown>;
  }>;
  documentos?: Array<{
    documentoId: string;
    montoAplicado: number;
  }>;
}
