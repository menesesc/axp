/**
 * Permisos granulares por módulo.
 *
 * Modelo: la columna `usuarios.permisos text[]` guarda entradas planas:
 *   - "<modulo>:<nivel>"     nivel de acceso al módulo ("view" | "edit").
 *   - "<modulo>:importes"    además de ver, puede ver los importes en pesos.
 *
 * Un módulo ausente = sin acceso. Un módulo con nivel pero sin ":importes"
 * (y que soporte el flag) ve solo cantidades: el server pone los montos en 0.
 *
 * Ejemplo — encargado que carga documentos pero no ve plata, y mira ventas
 * solo en unidades:
 *   { "documentos:edit", "ventas:view" }
 *
 * Reglas transversales:
 *   - Los usuarios ADMIN (tipo_acceso = 'ADMIN') no usan la matriz: acceso
 *     total. La matriz aplica a los usuarios no administradores.
 *   - El candado real vive en el servidor (middleware + requireModulo). La UI
 *     solo oculta lo que el server ya bloquea.
 */

// ---------------------------------------------------------------------------
// Niveles
// ---------------------------------------------------------------------------

export type Nivel = 'none' | 'view' | 'edit'

const ORDEN: Record<Nivel, number> = { none: 0, view: 1, edit: 2 }

export const NIVELES: Array<{ value: Nivel; label: string; hint: string }> = [
  { value: 'none', label: 'Sin acceso', hint: 'No ve la sección' },
  { value: 'view', label: 'Ver', hint: 'Solo lectura' },
  { value: 'edit', label: 'Editar', hint: 'Crear, modificar y eliminar' },
]

/** Métodos HTTP que se consideran escritura. */
export function esEscritura(metodo: string): boolean {
  return metodo === 'POST' || metodo === 'PATCH' || metodo === 'PUT' || metodo === 'DELETE'
}

/** Nivel mínimo que exige una request a una API según su método. */
export function nivelRequerido(metodo: string): Exclude<Nivel, 'none'> {
  return esEscritura(metodo) ? 'edit' : 'view'
}

// ---------------------------------------------------------------------------
// Módulos
// ---------------------------------------------------------------------------

export const MODULO = {
  DASHBOARD: 'dashboard',
  DOCUMENTOS: 'documentos',
  VENTAS: 'ventas',
  CONCILIACION: 'conciliacion',
  FINANZAS: 'finanzas',
  INFORMES: 'informes',
  SISTEMA: 'sistema',
  CONFIGURACION: 'configuracion',
} as const

export type Modulo = (typeof MODULO)[keyof typeof MODULO]

export interface ModuloDef {
  value: Modulo
  label: string
  hint: string
  /** Prefijos de páginas que cubre el módulo. */
  paginas: string[]
  /** Prefijos de API que cubre el módulo. */
  apis: string[]
  /** No tiene acciones de escritura: el nivel "Editar" no se ofrece. */
  soloLectura?: boolean
  /** Admite el flag "ver importes" (si está apagado, solo cantidades). */
  importes?: boolean
  /**
   * Reservado a administradores: no se ofrece en la matriz y ningún usuario no
   * admin puede acceder. Evita que alguien con "editar" en Configuración se
   * promueva a sí mismo a admin.
   */
  soloAdmin?: boolean
}

export const MODULOS: ModuloDef[] = [
  {
    value: MODULO.DASHBOARD,
    label: 'Dashboard',
    hint: 'Resumen general de la operación',
    paginas: ['/dashboard'],
    apis: ['/api/stats'],
    soloLectura: true,
    importes: true,
  },
  {
    value: MODULO.DOCUMENTOS,
    label: 'Documentos',
    hint: 'Comprobantes, items, proveedores y anotaciones',
    paginas: ['/documentos', '/documento', '/items', '/proveedores', '/anotaciones'],
    apis: ['/api/documentos', '/api/items', '/api/proveedores', '/api/anotaciones'],
    importes: true,
  },
  {
    value: MODULO.VENTAS,
    label: 'Ventas',
    hint: 'Cierres de caja, ranking, mozos y turnos',
    paginas: ['/ventas'],
    apis: ['/api/sales', '/api/ventas'],
    importes: true,
  },
  {
    value: MODULO.CONCILIACION,
    label: 'Conciliación',
    hint: 'Insumos, recetas y control de stock',
    paginas: ['/conciliacion'],
    apis: ['/api/conciliacion'],
  },
  {
    value: MODULO.FINANZAS,
    label: 'Finanzas',
    hint: 'Pagos, calendario de vencimientos y estadísticas',
    paginas: ['/pagos', '/finanzas', '/estadisticas'],
    apis: ['/api/pagos'],
  },
  {
    value: MODULO.INFORMES,
    label: 'Informes',
    hint: 'Compras, cuenta corriente, precios y proyecciones',
    paginas: ['/informes'],
    apis: ['/api/informes'],
    soloLectura: true,
    importes: true,
  },
  {
    value: MODULO.SISTEMA,
    label: 'Sistema',
    hint: 'Procesamiento de documentos y logs',
    paginas: ['/procesamiento'],
    apis: ['/api/logs'],
  },
  {
    value: MODULO.CONFIGURACION,
    label: 'Configuración',
    hint: 'Empresa, usuarios, canales e informes por mail',
    paginas: ['/configuracion'],
    apis: ['/api/configuracion', '/api/suscripciones'],
    soloAdmin: true,
  },
]

/** Módulos que se pueden asignar desde el panel de usuarios. */
export const MODULOS_ASIGNABLES = MODULOS.filter((m) => !m.soloAdmin)

const POR_VALUE = new Map<string, ModuloDef>(MODULOS.map((m) => [m.value, m]))

export function moduloDef(modulo: Modulo): ModuloDef | undefined {
  return POR_VALUE.get(modulo)
}

/**
 * Rutas que cualquier usuario autenticado puede usar, sin importar su matriz:
 * su propio plan, el visor de PDF y el consumo de su empresa.
 */
const COMUNES_PAGINAS = ['/configuracion/plan', '/panel', '/sin-acceso']
const COMUNES_APIS = ['/api/pdf', '/api/planes', '/api/configuracion/usage']

function matchPrefijo(pathname: string, prefijos: string[]): string | null {
  let mejor: string | null = null
  for (const p of prefijos) {
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      if (!mejor || p.length > mejor.length) mejor = p
    }
  }
  return mejor
}

export function esRutaComun(pathname: string): boolean {
  const lista = pathname.startsWith('/api/') ? COMUNES_APIS : COMUNES_PAGINAS
  return matchPrefijo(pathname, lista) !== null
}

/**
 * Módulo al que pertenece una ruta (página o API). Gana el prefijo más largo,
 * así `/informes/ventas` cae en Informes y no en Ventas.
 */
export function moduloDeRuta(pathname: string): Modulo | null {
  const esApi = pathname.startsWith('/api/')
  let mejor: { modulo: Modulo; largo: number } | null = null
  for (const m of MODULOS) {
    const hit = matchPrefijo(pathname, esApi ? m.apis : m.paginas)
    if (hit && (!mejor || hit.length > mejor.largo)) mejor = { modulo: m.value, largo: hit.length }
  }
  return mejor?.modulo ?? null
}

// ---------------------------------------------------------------------------
// Matriz de permisos (serialización en text[])
// ---------------------------------------------------------------------------

export interface PermisoModulo {
  nivel: Nivel
  /** Ve importes en pesos. Irrelevante si el módulo no admite el flag. */
  importes: boolean
}

export type Matriz = Record<string, PermisoModulo>

const SUFIJO_IMPORTES = 'importes'

/** Matriz vacía: sin acceso a nada. */
export function matrizVacia(): Matriz {
  const m: Matriz = {}
  for (const def of MODULOS) m[def.value] = { nivel: 'none', importes: false }
  return m
}

/**
 * Fallback para usuarios no administradores sin matriz cargada: se comportan
 * como el viejo VIEWER (ven todo menos Configuración, con importes). Evita
 * dejar gente afuera si todavía no corrió la migración de permisos.
 */
export function matrizLegacyViewer(): Matriz {
  const m = matrizVacia()
  for (const def of MODULOS) {
    if (def.soloAdmin) continue
    m[def.value] = { nivel: 'view', importes: true }
  }
  return m
}

/** Acceso total (administradores). */
export function matrizAdmin(): Matriz {
  const m: Matriz = {}
  for (const def of MODULOS) {
    m[def.value] = { nivel: def.soloLectura ? 'view' : 'edit', importes: true }
  }
  return m
}

/** text[] almacenado → matriz. */
export function parsePermisos(permisos: string[] | null | undefined): Matriz {
  const m = matrizVacia()
  if (!Array.isArray(permisos)) return m
  for (const raw of permisos) {
    if (typeof raw !== 'string') continue
    const partes = raw.split(':')
    const modulo = partes[0] ?? ''
    const sufijo = partes[1] ?? ''
    const def = POR_VALUE.get(modulo)
    const actual = m[modulo]
    if (!def || def.soloAdmin || !sufijo || !actual) continue
    if (sufijo === SUFIJO_IMPORTES) {
      if (def.importes) actual.importes = true
      continue
    }
    if (sufijo === 'view' || sufijo === 'edit') {
      const nivel: Nivel = def.soloLectura ? 'view' : sufijo
      if (ORDEN[nivel] > ORDEN[actual.nivel]) actual.nivel = nivel
    }
  }
  return m
}

/** Matriz → text[] para guardar (omite los módulos sin acceso). */
export function serializePermisos(matriz: Matriz): string[] {
  const out: string[] = []
  for (const def of MODULOS) {
    if (def.soloAdmin) continue
    const p = matriz[def.value]
    if (!p || p.nivel === 'none') continue
    const nivel: Nivel = def.soloLectura && p.nivel === 'edit' ? 'view' : p.nivel
    out.push(`${def.value}:${nivel}`)
    if (def.importes && p.importes) out.push(`${def.value}:${SUFIJO_IMPORTES}`)
  }
  return out
}

/** Descarta entradas desconocidas y normaliza (para lo que llega del cliente). */
export function sanitizePermisos(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return serializePermisos(parsePermisos(input as string[]))
}

/** ¿Tiene al menos un módulo habilitado? */
export function tieneMatriz(permisos: string[] | null | undefined): boolean {
  return Array.isArray(permisos) && permisos.some((p) => typeof p === 'string' && p.includes(':'))
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export interface SujetoPermisos {
  esAdmin: boolean
  permisos: string[] | null | undefined
}

/** Matriz efectiva de un usuario, contemplando admin y el fallback legacy. */
export function matrizDe({ esAdmin, permisos }: SujetoPermisos): Matriz {
  if (esAdmin) return matrizAdmin()
  if (!tieneMatriz(permisos)) return matrizLegacyViewer()
  return parsePermisos(permisos)
}

export function nivelDe(sujeto: SujetoPermisos, modulo: Modulo): Nivel {
  return matrizDe(sujeto)[modulo]?.nivel ?? 'none'
}

/** ¿Alcanza el nivel del usuario para lo que se pide? */
export function cumple(sujeto: SujetoPermisos, modulo: Modulo, minimo: Nivel): boolean {
  return ORDEN[nivelDe(sujeto, modulo)] >= ORDEN[minimo]
}

export function puedeVer(sujeto: SujetoPermisos, modulo: Modulo): boolean {
  return cumple(sujeto, modulo, 'view')
}

export function puedeEditar(sujeto: SujetoPermisos, modulo: Modulo): boolean {
  return cumple(sujeto, modulo, 'edit')
}

/**
 * ¿Ve importes en pesos en este módulo? Si el módulo no admite el flag, ver el
 * módulo implica ver los importes.
 */
export function veImportes(sujeto: SujetoPermisos, modulo: Modulo): boolean {
  if (!puedeVer(sujeto, modulo)) return false
  const def = POR_VALUE.get(modulo)
  if (!def?.importes) return true
  return matrizDe(sujeto)[modulo]?.importes === true
}

/** Primera página que el usuario puede abrir; su landing tras el login. */
export function landingDe(sujeto: SujetoPermisos): string {
  for (const def of MODULOS) {
    const destino = def.paginas[0]
    if (destino && puedeVer(sujeto, def.value)) return destino
  }
  return '/configuracion/plan'
}
