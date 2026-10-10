/**
 * Permisos granulares por sección.
 *
 * La unidad de permiso es la SECCIÓN: una pestaña o una página concreta
 * ("Ranking" dentro de Ventas, "Items" dentro de Documentos). El MÓDULO es solo
 * la agrupación con la que se muestran en la UI y con la que se ordena el menú.
 *
 * Modelo: la columna `usuarios.permisos text[]` guarda entradas planas:
 *   - "<seccion>:<nivel>"     nivel de acceso a la sección ("view" | "edit").
 *   - "<seccion>:importes"    además de ver, puede ver los importes en pesos.
 *
 * Una sección ausente = sin acceso. Una sección con nivel pero sin ":importes"
 * (y que soporte el flag) ve solo cantidades: el server pone los montos en 0.
 *
 * Compatibilidad: una entrada a nivel de módulo ("ventas:view") se expande a
 * todas las secciones de ese módulo. Así siguen valiendo los permisos guardados
 * con el modelo anterior, sin migración previa.
 *
 * Ejemplo — encargado que carga comprobantes pero no ve plata, y de ventas mira
 * solo el ranking, en unidades:
 *   { "documentos.comprobantes:edit", "ventas.ranking:view" }
 *
 * Reglas transversales:
 *   - Los usuarios ADMIN (tipo_acceso = 'ADMIN') no usan la matriz: acceso
 *     total. La matriz aplica a los usuarios no administradores.
 *   - El candado real vive en el servidor (middleware + requireSeccion). La UI
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
// Módulos (agrupación)
// ---------------------------------------------------------------------------

/*
 * Los módulos son la agrupación con la que se arma la matriz de permisos, y
 * están puestos para que coincidan uno a uno con el menú. Antes agrupaban por
 * el modelo viejo ("Documentos", "Conciliación", "Finanzas"): el menú decía
 * Stock y la matriz Conciliación, con lo cual dar acceso a Stock era adivinar
 * dónde buscarlo.
 */
export const MODULO = {
  DASHBOARD: 'dashboard',
  COMPROBANTES: 'comprobantes',
  PAGOS: 'pagos',
  VENTAS: 'ventas',
  STOCK: 'stock',
  RECETAS: 'recetas',
  PROVEEDORES: 'proveedores',
  ITEMS: 'items',
  INFORMES: 'informes',
  SISTEMA: 'sistema',
  CONFIGURACION: 'configuracion',
} as const

export type Modulo = (typeof MODULO)[keyof typeof MODULO]

export interface ModuloDef {
  value: Modulo
  label: string
  hint: string
  /** Reservado a administradores: no se ofrece en la matriz. */
  soloAdmin?: boolean
}

export const MODULOS: ModuloDef[] = [
  { value: MODULO.DASHBOARD, label: 'Inicio', hint: 'Resumen general de la operación' },
  { value: MODULO.COMPROBANTES, label: 'Comprobantes', hint: 'Facturas, remitos y anotaciones' },
  { value: MODULO.PAGOS, label: 'Pagos', hint: 'Órdenes de pago y calendario de vencimientos' },
  { value: MODULO.VENTAS, label: 'Ventas', hint: 'Cierres de caja, ranking, mozos y turnos' },
  { value: MODULO.STOCK, label: 'Stock', hint: 'Insumos, recetas de costeo, conteo, pedidos y conciliación' },
  { value: MODULO.RECETAS, label: 'Recetario', hint: 'Libro de recetas de la cocina' },
  { value: MODULO.PROVEEDORES, label: 'Proveedores', hint: 'Ficha, contactos y cuenta de cada proveedor' },
  { value: MODULO.ITEMS, label: 'Items', hint: 'Líneas de las facturas y su categoría' },
  { value: MODULO.INFORMES, label: 'Informes', hint: 'Compras, cuenta corriente, precios y proyecciones' },
  { value: MODULO.SISTEMA, label: 'Sistema', hint: 'Procesamiento de documentos y logs' },
  {
    value: MODULO.CONFIGURACION,
    label: 'Configuración',
    hint: 'Empresa, usuarios, canales e informes por mail',
    soloAdmin: true,
  },
]

/*
 * Módulos del modelo viejo, para los permisos ya guardados con esa forma
 * ("conciliacion:view"). Se mantienen sólo al leer: no se ofrecen en la matriz
 * ni se vuelven a guardar así.
 */
const MODULOS_LEGACY: Record<string, string[]> = {
  documentos: ['documentos.comprobantes', 'documentos.items', 'documentos.proveedores', 'documentos.anotaciones'],
  conciliacion: [
    'conciliacion.insumos', 'conciliacion.recetas', 'conciliacion.control', 'conciliacion.cobertura',
    'conciliacion.stock', 'conciliacion.pedidos', 'conciliacion.despacho', 'conciliacion.compras',
    'conciliacion.margen',
  ],
  finanzas: ['finanzas.pagos', 'finanzas.calendario', 'finanzas.estadisticas'],
}

const MODULO_POR_VALUE = new Map<string, ModuloDef>(MODULOS.map((m) => [m.value, m]))

export function moduloDef(modulo: Modulo): ModuloDef | undefined {
  return MODULO_POR_VALUE.get(modulo)
}

// ---------------------------------------------------------------------------
// Secciones (unidad de permiso)
// ---------------------------------------------------------------------------

export interface SeccionDef {
  /** Identificador estable: "<modulo>.<slug>". Es lo que se guarda en la DB. */
  value: string
  modulo: Modulo
  label: string
  /** Pestaña dentro de una página con tabs (el `value` del TabsTrigger). */
  tab?: string
  /** Prefijos de páginas que cubre. */
  paginas: string[]
  /** Prefijos de API que cubre. */
  apis: string[]
  /** No tiene acciones de escritura: el nivel "Editar" no se ofrece. */
  soloLectura?: boolean
  /** Admite el flag "ver importes" (si está apagado, solo cantidades). */
  importes?: boolean
  /** Reservado a administradores. */
  soloAdmin?: boolean
}

/**
 * Catálogo de secciones. El orden es el que usa la UI y el que define la
 * landing tras el login (la primera que el usuario pueda abrir).
 *
 * Al agregar una pestaña o una página nueva hay que declararla acá, o queda
 * denegada por defecto para los usuarios no administradores.
 */
export const SECCIONES: SeccionDef[] = [
  // --- Dashboard -----------------------------------------------------------
  {
    value: 'dashboard.general',
    modulo: MODULO.DASHBOARD,
    label: 'Dashboard',
    paginas: ['/dashboard'],
    apis: ['/api/stats'],
    soloLectura: true,
    importes: true,
  },

  // --- Documentos ----------------------------------------------------------
  {
    value: 'documentos.comprobantes',
    modulo: MODULO.COMPROBANTES,
    label: 'Comprobantes',
    paginas: ['/documentos', '/documento'],
    apis: ['/api/documentos'],
    importes: true,
  },
  {
    value: 'documentos.items',
    modulo: MODULO.ITEMS,
    label: 'Items',
    // La revisión de líneas edita items, así que va con el mismo permiso.
    paginas: ['/items', '/compras/revision'],
    apis: ['/api/items', '/api/compras/revision-lineas'],
    importes: true,
  },
  {
    value: 'documentos.proveedores',
    modulo: MODULO.PROVEEDORES,
    label: 'Proveedores',
    paginas: ['/proveedores'],
    apis: ['/api/proveedores'],
    importes: true,
  },
  {
    value: 'documentos.anotaciones',
    modulo: MODULO.COMPROBANTES,
    label: 'Anotaciones',
    paginas: ['/anotaciones'],
    apis: ['/api/anotaciones'],
  },

  // --- Ventas (pestañas de /ventas) ----------------------------------------
  {
    value: 'ventas.cierres',
    modulo: MODULO.VENTAS,
    label: 'Cierres',
    tab: 'cierres',
    paginas: ['/ventas'],
    apis: ['/api/sales/closures'],
    importes: true,
  },
  {
    value: 'ventas.ranking',
    modulo: MODULO.VENTAS,
    label: 'Ranking',
    tab: 'ranking',
    paginas: ['/ventas'],
    apis: ['/api/sales/ranking', '/api/sales/units-daily'],
    importes: true,
  },
  {
    value: 'ventas.mozos',
    modulo: MODULO.VENTAS,
    label: 'Mozos',
    tab: 'mozos',
    paginas: ['/ventas'],
    apis: ['/api/sales/waiters'],
    importes: true,
  },
  {
    value: 'ventas.pagos',
    modulo: MODULO.VENTAS,
    label: 'Formas de pago',
    tab: 'pagos',
    paginas: ['/ventas'],
    apis: ['/api/sales/payments'],
    importes: true,
  },
  {
    value: 'ventas.facturacion',
    modulo: MODULO.VENTAS,
    label: 'Facturación',
    tab: 'facturacion',
    paginas: ['/ventas'],
    apis: ['/api/sales/billing'],
    importes: true,
  },
  {
    value: 'ventas.turnos',
    modulo: MODULO.VENTAS,
    label: 'Por turno',
    tab: 'turnos',
    paginas: ['/ventas'],
    apis: ['/api/sales/by-shift'],
    importes: true,
  },
  {
    value: 'ventas.auditoria',
    modulo: MODULO.VENTAS,
    label: 'Auditoría',
    tab: 'auditoria',
    paginas: ['/ventas'],
    // reparse-all lo dispara la pestaña de auditoría: el prefijo más largo gana
    // sobre '/api/sales/closures' de la pestaña Cierres.
    apis: ['/api/sales/audit', '/api/sales/closures/reparse-all'],
    importes: true,
  },
  {
    value: 'ventas.csv',
    modulo: MODULO.VENTAS,
    label: 'Ventas (CSV)',
    tab: 'csv',
    paginas: ['/ventas'],
    apis: ['/api/ventas'],
    importes: true,
  },

  // --- Conciliación --------------------------------------------------------
  {
    value: 'conciliacion.insumos',
    modulo: MODULO.STOCK,
    label: 'Insumos',
    tab: 'insumos',
    paginas: ['/conciliacion/insumos'],
    // venta-directa crea insumos atados a un producto: es la misma sección,
    // y así el middleware exige lo mismo que el guard de la ruta.
    apis: ['/api/conciliacion/insumos', '/api/conciliacion/venta-directa'],
    importes: true,
  },
  {
    value: 'conciliacion.recetas',
    modulo: MODULO.STOCK,
    label: 'Recetas',
    paginas: ['/conciliacion/recetas'],
    apis: ['/api/conciliacion/recetas'],
    importes: true,
  },
  {
    value: 'conciliacion.control',
    modulo: MODULO.STOCK,
    label: 'Conciliación de stock',
    tab: 'insumos',
    paginas: ['/conciliacion'],
    apis: ['/api/conciliacion'],
    importes: true,
  },
  {
    value: 'conciliacion.cobertura',
    modulo: MODULO.STOCK,
    label: 'Cobertura de recetas',
    tab: 'cobertura',
    paginas: ['/conciliacion'],
    apis: ['/api/conciliacion/cobertura'],
    soloLectura: true,
    importes: true,
  },
  {
    value: 'conciliacion.stock',
    modulo: MODULO.STOCK,
    label: 'Conteo de stock',
    paginas: ['/conciliacion/stock'],
    apis: ['/api/conciliacion/stock'],
  },
  {
    value: 'conciliacion.pedidos',
    modulo: MODULO.STOCK,
    label: 'Pedidos internos',
    paginas: ['/pedidos'],
    apis: ['/api/pedidos'],
  },
  {
    value: 'conciliacion.despacho',
    modulo: MODULO.STOCK,
    label: 'Despacho de pedidos (central)',
    paginas: ['/pedidos'],
    apis: ['/api/pedidos/despacho'],
  },
  {
    value: 'conciliacion.compras',
    modulo: MODULO.STOCK,
    label: 'Compras sugeridas',
    paginas: ['/compras'],
    apis: ['/api/compras'],
    importes: true,
  },
  {
    value: 'conciliacion.margen',
    modulo: MODULO.STOCK,
    label: 'Margen por producto',
    tab: 'margen',
    paginas: ['/conciliacion'],
    apis: ['/api/conciliacion/margen'],
    soloLectura: true,
    importes: true,
  },

  // --- Finanzas ------------------------------------------------------------
  {
    value: 'finanzas.pagos',
    modulo: MODULO.PAGOS,
    label: 'Pagos',
    paginas: ['/pagos'],
    apis: ['/api/pagos'],
    importes: true,
  },
  {
    value: 'finanzas.calendario',
    modulo: MODULO.PAGOS,
    label: 'Calendario',
    // Las obligaciones periódicas son lo que alimenta el calendario con los
    // vencimientos estimados, así que van con el mismo permiso.
    paginas: ['/finanzas'],
    apis: ['/api/pagos/calendario', '/api/obligaciones'],
    importes: true,
  },
  {
    value: 'finanzas.estadisticas',
    modulo: MODULO.INFORMES,
    label: 'Estadísticas',
    paginas: ['/estadisticas'],
    apis: [],
    soloLectura: true,
    importes: true,
  },

  // --- Informes (todos de solo lectura) ------------------------------------
  {
    value: 'informes.resumen',
    modulo: MODULO.INFORMES,
    label: 'Resumen ejecutivo',
    paginas: ['/informes'],
    apis: ['/api/informes/resumen'],
    soloLectura: true,
    importes: true,
  },
  {
    value: 'informes.ventas',
    modulo: MODULO.INFORMES,
    label: 'Ventas',
    paginas: ['/informes/ventas'],
    apis: [],
    soloLectura: true,
    importes: true,
  },
  {
    value: 'informes.cuenta_corriente',
    modulo: MODULO.INFORMES,
    label: 'Cuenta corriente',
    paginas: ['/informes/cuenta-corriente'],
    apis: ['/api/informes/cuenta-corriente'],
    soloLectura: true,
    importes: true,
  },
  {
    value: 'informes.precios',
    modulo: MODULO.INFORMES,
    label: 'Análisis de precios',
    paginas: ['/informes/precios'],
    apis: ['/api/informes/precios'],
    soloLectura: true,
    importes: true,
  },
  {
    value: 'informes.compras',
    modulo: MODULO.INFORMES,
    label: 'Compras',
    paginas: ['/informes/compras'],
    apis: ['/api/informes/compras'],
    soloLectura: true,
    importes: true,
  },
  {
    value: 'informes.proyecciones',
    modulo: MODULO.INFORMES,
    label: 'Proyecciones IA',
    paginas: ['/informes/proyecciones'],
    apis: ['/api/informes/proyecciones'],
    soloLectura: true,
    importes: true,
  },

  // --- Recetario -----------------------------------------------------------
  {
    value: 'recetas.libro',
    modulo: MODULO.RECETAS,
    label: 'Recetario',
    paginas: ['/recetas', '/configuracion/recetario'],
    apis: ['/api/recetas'],
    importes: true, // el costo por porción es plata: sin el flag, no se ve
  },

  // --- Sistema -------------------------------------------------------------
  {
    value: 'sistema.procesamiento',
    modulo: MODULO.SISTEMA,
    label: 'Procesamiento',
    paginas: ['/procesamiento'],
    apis: ['/api/logs'],
  },

  // --- Configuración (solo admin) ------------------------------------------
  {
    value: 'configuracion.general',
    modulo: MODULO.CONFIGURACION,
    label: 'Configuración',
    paginas: ['/configuracion'],
    apis: ['/api/configuracion', '/api/suscripciones'],
    soloAdmin: true,
  },
]

/**
 * Identificadores de sección, para usarlos desde las rutas sin escribir el
 * string a mano. Los valores son los mismos que se guardan en la DB.
 */
export const SECCION = {
  DASHBOARD: 'dashboard.general',
  DOC_COMPROBANTES: 'documentos.comprobantes',
  DOC_ITEMS: 'documentos.items',
  DOC_PROVEEDORES: 'documentos.proveedores',
  DOC_ANOTACIONES: 'documentos.anotaciones',
  VENTAS_CIERRES: 'ventas.cierres',
  VENTAS_RANKING: 'ventas.ranking',
  VENTAS_MOZOS: 'ventas.mozos',
  VENTAS_PAGOS: 'ventas.pagos',
  VENTAS_FACTURACION: 'ventas.facturacion',
  VENTAS_TURNOS: 'ventas.turnos',
  VENTAS_AUDITORIA: 'ventas.auditoria',
  VENTAS_CSV: 'ventas.csv',
  CONCILIACION_INSUMOS: 'conciliacion.insumos',
  CONCILIACION_RECETAS: 'conciliacion.recetas',
  CONCILIACION_CONTROL: 'conciliacion.control',
  CONCILIACION_MARGEN: 'conciliacion.margen',
  CONCILIACION_COBERTURA: 'conciliacion.cobertura',
  CONCILIACION_STOCK: 'conciliacion.stock',
  CONCILIACION_PEDIDOS: 'conciliacion.pedidos',
  CONCILIACION_DESPACHO: 'conciliacion.despacho',
  CONCILIACION_COMPRAS: 'conciliacion.compras',
  FINANZAS_PAGOS: 'finanzas.pagos',
  FINANZAS_CALENDARIO: 'finanzas.calendario',
  FINANZAS_ESTADISTICAS: 'finanzas.estadisticas',
  INFORMES_RESUMEN: 'informes.resumen',
  INFORMES_VENTAS: 'informes.ventas',
  INFORMES_CUENTA_CORRIENTE: 'informes.cuenta_corriente',
  INFORMES_PRECIOS: 'informes.precios',
  INFORMES_COMPRAS: 'informes.compras',
  INFORMES_PROYECCIONES: 'informes.proyecciones',
  RECETAS_LIBRO: 'recetas.libro',
  SISTEMA_PROCESAMIENTO: 'sistema.procesamiento',
  CONFIGURACION: 'configuracion.general',
} as const

export type SeccionId = (typeof SECCION)[keyof typeof SECCION]

/** Secciones que se pueden asignar desde el panel de usuarios. */
export const SECCIONES_ASIGNABLES = SECCIONES.filter((s) => !s.soloAdmin)

const SECCION_POR_VALUE = new Map<string, SeccionDef>(SECCIONES.map((s) => [s.value, s]))

export function seccionDef(seccion: string): SeccionDef | undefined {
  return SECCION_POR_VALUE.get(seccion)
}

/** Secciones de un módulo, en el orden del catálogo. */
export function seccionesDeModulo(modulo: Modulo): SeccionDef[] {
  return SECCIONES.filter((s) => s.modulo === modulo)
}

/** Módulos que tienen al menos una sección asignable, en orden. */
export const MODULOS_ASIGNABLES = MODULOS.filter(
  (m) => !m.soloAdmin && SECCIONES_ASIGNABLES.some((s) => s.modulo === m.value)
)

// ---------------------------------------------------------------------------
// Resolución de rutas
// ---------------------------------------------------------------------------

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
 * Secciones candidatas para una ruta. Gana el prefijo más largo, así
 * `/informes/ventas` cae en Informes → Ventas y no en Resumen ejecutivo.
 *
 * Devuelve una lista porque varias secciones comparten página: las ocho
 * pestañas de Ventas viven todas en `/ventas`. Para abrir la página alcanza con
 * tener una; las APIs, en cambio, resuelven siempre a una sola sección.
 */
export function seccionesDeRuta(pathname: string): SeccionDef[] {
  const esApi = pathname.startsWith('/api/')
  let largo = -1
  let out: SeccionDef[] = []
  for (const s of SECCIONES) {
    const hit = matchPrefijo(pathname, esApi ? s.apis : s.paginas)
    if (!hit) continue
    if (hit.length > largo) {
      largo = hit.length
      out = [s]
    } else if (hit.length === largo) {
      out.push(s)
    }
  }
  return out
}

/** Módulo al que pertenece una ruta, o null si no está declarada. */
export function moduloDeRuta(pathname: string): Modulo | null {
  return seccionesDeRuta(pathname)[0]?.modulo ?? null
}

// ---------------------------------------------------------------------------
// Matriz de permisos (serialización en text[])
// ---------------------------------------------------------------------------

export interface PermisoSeccion {
  nivel: Nivel
  /** Ve importes en pesos. Irrelevante si la sección no admite el flag. */
  importes: boolean
}

/** Clave = `SeccionDef.value`. */
export type Matriz = Record<string, PermisoSeccion>

const SUFIJO_IMPORTES = 'importes'

/** Matriz vacía: sin acceso a nada. */
export function matrizVacia(): Matriz {
  const m: Matriz = {}
  for (const def of SECCIONES) m[def.value] = { nivel: 'none', importes: false }
  return m
}

/**
 * Fallback para usuarios no administradores sin matriz cargada: se comportan
 * como el viejo VIEWER (ven todo menos Configuración, con importes). Evita
 * dejar gente afuera si todavía no corrió la migración de permisos.
 */
export function matrizLegacyViewer(): Matriz {
  const m = matrizVacia()
  for (const def of SECCIONES) {
    if (def.soloAdmin) continue
    m[def.value] = { nivel: 'view', importes: true }
  }
  return m
}

/** Acceso total (administradores). */
export function matrizAdmin(): Matriz {
  const m: Matriz = {}
  for (const def of SECCIONES) {
    m[def.value] = { nivel: def.soloLectura ? 'view' : 'edit', importes: true }
  }
  return m
}

/** Sube el nivel de una entrada sin bajarlo nunca (las entradas se acumulan). */
function subirNivel(m: Matriz, def: SeccionDef, sufijo: string) {
  const actual = m[def.value]
  if (!actual) return
  if (sufijo === SUFIJO_IMPORTES) {
    if (def.importes) actual.importes = true
    return
  }
  if (sufijo !== 'view' && sufijo !== 'edit') return
  const nivel: Nivel = def.soloLectura ? 'view' : sufijo
  if (ORDEN[nivel] > ORDEN[actual.nivel]) actual.nivel = nivel
}

/**
 * text[] almacenado → matriz.
 *
 * Acepta las dos formas: "<seccion>:<sufijo>" y, por compatibilidad con el
 * modelo anterior, "<modulo>:<sufijo>", que se expande a todas las secciones
 * del módulo.
 */
export function parsePermisos(permisos: string[] | null | undefined): Matriz {
  const m = matrizVacia()
  if (!Array.isArray(permisos)) return m
  for (const raw of permisos) {
    if (typeof raw !== 'string') continue
    const corte = raw.indexOf(':')
    if (corte <= 0) continue
    const clave = raw.slice(0, corte)
    const sufijo = raw.slice(corte + 1)
    if (!sufijo) continue

    const seccion = SECCION_POR_VALUE.get(clave)
    if (seccion) {
      if (!seccion.soloAdmin) subirNivel(m, seccion, sufijo)
      continue
    }

    // Entrada a nivel de módulo (modelo viejo): vale para todas sus secciones.
    const modulo = MODULO_POR_VALUE.get(clave)
    if (modulo && !modulo.soloAdmin) {
      for (const def of seccionesDeModulo(modulo.value)) {
        if (!def.soloAdmin) subirNivel(m, def, sufijo)
      }
      continue
    }

    // Módulo de la agrupación anterior, que ya no existe como tal.
    for (const valor of MODULOS_LEGACY[clave] ?? []) {
      const def = SECCION_POR_VALUE.get(valor)
      if (def && !def.soloAdmin) subirNivel(m, def, sufijo)
    }
  }
  return m
}

/** Matriz → text[] para guardar (omite las secciones sin acceso). */
export function serializePermisos(matriz: Matriz): string[] {
  const out: string[] = []
  for (const def of SECCIONES) {
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

/** ¿Tiene al menos una entrada reconocible? */
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

export function nivelDe(sujeto: SujetoPermisos, seccion: string): Nivel {
  return matrizDe(sujeto)[seccion]?.nivel ?? 'none'
}

/** ¿Alcanza el nivel del usuario en esa sección para lo que se pide? */
export function cumple(sujeto: SujetoPermisos, seccion: string, minimo: Nivel): boolean {
  return ORDEN[nivelDe(sujeto, seccion)] >= ORDEN[minimo]
}

export function puedeVer(sujeto: SujetoPermisos, seccion: string): boolean {
  return cumple(sujeto, seccion, 'view')
}

export function puedeEditar(sujeto: SujetoPermisos, seccion: string): boolean {
  return cumple(sujeto, seccion, 'edit')
}

/** ¿Alcanza en ALGUNA sección del módulo? Sirve para mostrar el grupo del menú. */
export function cumpleModulo(sujeto: SujetoPermisos, modulo: Modulo, minimo: Nivel = 'view'): boolean {
  return seccionesDeModulo(modulo).some((s) => cumple(sujeto, s.value, minimo))
}

export function puedeVerModulo(sujeto: SujetoPermisos, modulo: Modulo): boolean {
  return cumpleModulo(sujeto, modulo, 'view')
}

/**
 * ¿Ve importes en pesos en esta sección? Si la sección no admite el flag, verla
 * implica ver los importes.
 */
export function veImportes(sujeto: SujetoPermisos, seccion: string): boolean {
  if (!puedeVer(sujeto, seccion)) return false
  const def = SECCION_POR_VALUE.get(seccion)
  if (!def?.importes) return true
  return matrizDe(sujeto)[seccion]?.importes === true
}

/** ¿Ve importes en alguna sección del módulo? Para vistas que agregan varias. */
export function veImportesModulo(sujeto: SujetoPermisos, modulo: Modulo): boolean {
  return seccionesDeModulo(modulo).some((s) => veImportes(sujeto, s.value))
}

/**
 * ¿Puede abrir esta ruta? Para páginas compartidas por varias secciones alcanza
 * con tener una; para APIs la ruta resuelve a una sola sección.
 */
export function puedeAbrirRuta(sujeto: SujetoPermisos, pathname: string, minimo: Nivel): boolean {
  const secciones = seccionesDeRuta(pathname)
  if (secciones.length === 0) return false
  // Las secciones soloAdmin no se filtran acá: `parsePermisos` ya se niega a
  // asignárselas a un usuario común, y `matrizAdmin` sí se las da al admin.
  return secciones.some((s) => cumple(sujeto, s.value, minimo))
}

/** Primera página que el usuario puede abrir; su landing tras el login. */
export function landingDe(sujeto: SujetoPermisos): string {
  for (const def of SECCIONES) {
    if (def.soloAdmin) continue
    const destino = def.paginas[0]
    if (destino && puedeVer(sujeto, def.value)) return destino
  }
  return '/configuracion/plan'
}
