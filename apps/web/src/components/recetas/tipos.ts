export interface CategoriaReceta {
  id: string
  nombre: string
  emoji: string | null
  color: string | null
  orden: number
  recetas: number
}

export interface DispositivoReceta {
  id: string
  nombre: string
  emoji: string | null
  orden: number
  recetas: number
}

export interface RecetaListada {
  id: string
  titulo: string
  descripcion: string | null
  estado: 'borrador' | 'publicada'
  prepMin: number | null
  totalMin: number | null
  porciones: number
  dificultad: string | null
  autor: string | null
  fotoKey: string | null
  youtubeUrl: string | null
  destacada: boolean
  categoria: { id: string; nombre: string; emoji: string | null; color: string | null } | null
  dispositivoIds: string[]
  favorita: boolean
  pasos: number
  /** null cuando el usuario no tiene permiso de ver importes. */
  costoPorcion: number | null
  /** true si algún ingrediente no se pudo costear. */
  costoParcial: boolean
}

export interface IngredienteReceta {
  id?: string
  seccion: string | null
  nombre: string
  cantidad: number | null
  unidad: string | null
  nota: string | null
  insumoId: string | null
  insumo?: { id: string; nombre: string; unidadBase: string } | null
}

export interface PasoReceta {
  id?: string
  seccion: string | null
  texto: string
}

export interface RecetaDetalle extends Omit<RecetaListada, 'dispositivoIds' | 'pasos'> {
  categoriaId: string | null
  dispositivos: Array<{ id: string; nombre: string; emoji: string | null }>
  ingredientes: IngredienteReceta[]
  pasos: PasoReceta[]
  sugerencias: Array<{ id: string; texto: string }>
  nota: string | null
  costo: { total: number; costeados: number; ingredientes: number; faltantes: string[] } | null
}

/** URL de la foto. Las fotos se sirven por la API, el bucket es privado. */
export const fotoUrl = (key: string | null) =>
  key ? `/api/recetas/foto?key=${encodeURIComponent(key)}` : null

export const fmtMin = (m: number | null) => {
  if (!m) return '—'
  if (m >= 1440) return `${Math.round(m / 1440)} d`
  if (m >= 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
  return `${m} min`
}

export const fmtPesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
