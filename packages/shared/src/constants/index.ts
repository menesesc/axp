/**
 * Constantes compartidas - AXP
 */

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ============================================================================
// ROLES Y PERMISOS
// ============================================================================

export const ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

// Permisos por rol
export const PERMISOS_POR_ROL = {
  SUPERADMIN: [
    'ver_todos_clientes',
    'crear_cliente',
    'editar_cliente',
    'crear_usuario',
    'editar_usuario',
    'ver_todas_metricas',
  ],
  ADMIN: [
    'ver_documentos',
    'crear_documento',
    'editar_documento',
    'confirmar_documento',
    'ver_proveedores',
    'crear_proveedor',
    'editar_proveedor',
    'ver_pagos',
    'crear_pago',
    'editar_pago',
    'ver_reportes',
  ],
  USER: ['ver_documentos', 'crear_documento', 'editar_documento', 'ver_proveedores', 'ver_pagos'],
} as const;

// ============================================================================
// DOCUMENTOS
// ============================================================================

export const TIPOS_DOCUMENTO = {
  FACTURA: 'FACTURA',
  REMITO: 'REMITO',
  NOTA_CREDITO: 'NOTA_CREDITO',
} as const;

export const LETRAS_FACTURA = {
  A: 'A',
  B: 'B',
  C: 'C',
} as const;

export const ESTADOS_REVISION = {
  PENDIENTE: 'PENDIENTE',
  CONFIRMADO: 'CONFIRMADO',
  ERROR: 'ERROR',
  DUPLICADO: 'DUPLICADO',
} as const;

export const SOURCES_DOCUMENTO = {
  SFTP: 'SFTP',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  MANUAL: 'MANUAL',
} as const;

// Campos requeridos por tipo de documento
export const CAMPOS_REQUERIDOS_DOCUMENTO = {
  FACTURA: ['proveedor', 'letra', 'puntoVenta', 'numero', 'fechaEmision', 'total'],
  REMITO: ['proveedor', 'puntoVenta', 'numero', 'fechaEmision'],
  NOTA_CREDITO: ['proveedor', 'letra', 'puntoVenta', 'numero', 'fechaEmision', 'total'],
} as const;

// Confidence score mínimo para auto-confirmar
export const MIN_CONFIDENCE_SCORE = 85;

// ============================================================================
// PAGOS
// ============================================================================

export const ESTADOS_PAGO = {
  BORRADOR: 'BORRADOR',
  PAGADO: 'PAGADO',
  ANULADO: 'ANULADO',
} as const;

export const TIPOS_PAGO_METODO = {
  EFECTIVO: 'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CHEQUE: 'CHEQUE',
} as const;

// Campos meta requeridos por tipo de pago
export const META_REQUERIDA_PAGO = {
  EFECTIVO: [],
  TRANSFERENCIA: ['banco', 'cbu', 'referencia'],
  CHEQUE: ['numero', 'banco', 'vencimiento'],
} as const;

// ============================================================================
// ARCHIVOS Y STORAGE
// ============================================================================

export const FILE_CONSTRAINTS = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB para PDFs
  ALLOWED_TYPES: ['application/pdf'],
  ALLOWED_EXTENSIONS: ['.pdf'],
  MIN_SIZE: 1024, // 1KB mínimo
} as const;

// Prefijos de R2 por tipo
export const R2_PREFIXES = {
  PDF_RAW: 'raw',
  PDF_FINAL: 'final',
  TEXTRACT_OUTPUT: 'textract',
  COMPROBANTES_PAGO: 'comprobantes',
} as const;

// ============================================================================
// INGESTA (Worker)
// ============================================================================

export const INGEST_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  ERROR: 'ERROR',
} as const;

export const INGEST_SOURCES = {
  SFTP: 'SFTP',
  DRIVE: 'DRIVE',
} as const;

// Retry policy
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 5000, // 5 segundos
  MAX_DELAY_MS: 3600000, // 1 hora
  BACKOFF_MULTIPLIER: 2, // Exponential backoff
} as const;

// Polling interval para worker
export const WORKER_CONFIG = {
  POLLING_INTERVAL_MS: 5000,
  MAX_CONCURRENT_JOBS: 3,
  BATCH_SIZE: 10,
} as const;

// ============================================================================
// OCR Y TEXTRACT
// ============================================================================

export const TEXTRACT_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  SUPPORTED_FORMATS: ['PDF'],
  MIN_CONFIDENCE: 50, // Confidence mínimo para considerar válido
  EXPENSE_FIELDS: [
    'VENDOR_NAME',
    'INVOICE_NUMBER',
    'INVOICE_DATE',
    'DUE_DATE',
    'SUBTOTAL',
    'TAX',
    'TOTAL',
  ],
} as const;

// ============================================================================
// BÚSQUEDA
// ============================================================================

export const SEARCH_CONFIG = {
  MIN_SEARCH_LENGTH: 3,
  MAX_RESULTS: 50,
  SIMILARITY_THRESHOLD: 0.3, // Para pg_trgm
  DEBOUNCE_MS: 300,
} as const;

// ============================================================================
// PAGINATION
// ============================================================================

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
} as const;

// ============================================================================
// VALIDACIÓN
// ============================================================================

// Regex patterns
export const PATTERNS = {
  CUIT: /^\d{11}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PUNTO_VENTA: /^\d{4}$/,
  NUMERO_FACTURA: /^\d{8}$/,
  SHA256: /^[a-f0-9]{64}$/i,
} as const;

// ============================================================================
// MONEDAS
// ============================================================================

export const MONEDAS = {
  ARS: 'ARS',
  USD: 'USD',
  EUR: 'EUR',
} as const;

export const SIMBOLOS_MONEDA = {
  ARS: '$',
  USD: 'US$',
  EUR: '€',
} as const;

// ============================================================================
// ENVIRONMENT
// ============================================================================

export const ENV = {
  DEV: 'development',
  PROD: 'production',
  TEST: 'test',
} as const;

// ============================================================================
// RATE LIMITS (para API)
// ============================================================================

export const RATE_LIMITS = {
  PUBLIC: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutos
    MAX_REQUESTS: 100,
  },
  AUTHENTICATED: {
    WINDOW_MS: 15 * 60 * 1000,
    MAX_REQUESTS: 1000,
  },
  ADMIN: {
    WINDOW_MS: 15 * 60 * 1000,
    MAX_REQUESTS: 5000,
  },
} as const;

// ============================================================================
// CACHE TTLs (en segundos)
// ============================================================================

export const CACHE_TTL = {
  CLIENTE: 3600, // 1 hora
  PROVEEDOR: 1800, // 30 minutos
  DOCUMENTO: 300, // 5 minutos
  SEARCH_RESULTS: 60, // 1 minuto
} as const;
