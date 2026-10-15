'use client'

import { useRouter } from 'next/navigation'
import { RecetaEditor } from '@/components/recetas/receta-editor'
import type { RecetaDetalle } from '@/components/recetas/tipos'

/**
 * Receta nueva.
 *
 * Vive sólo en la pantalla hasta que se aprieta guardar. Antes se creaba la
 * fila al entrar acá y cancelar dejaba una "Receta sin título" vacía en el
 * libro: el usuario cancelaba y la receta quedaba igual.
 */

const VACIA: RecetaDetalle = {
  id: '',
  titulo: '',
  descripcion: null,
  categoriaId: null,
  categoria: null,
  estado: 'borrador',
  prepMin: null,
  totalMin: null,
  // 10 porciones es el estándar con el que se escribe en la cocina.
  porciones: 10,
  dificultad: 'Media',
  autor: null,
  fotoKey: null,
  youtubeUrl: null,
  destacada: false,
  favorita: false,
  dispositivos: [],
  ingredientes: [],
  pasos: [],
  sugerencias: [],
  nota: null,
  costo: null,
  costoPorcion: null,
  costoParcial: false,
}

export default function RecetaNuevaPage() {
  const router = useRouter()
  return (
    <RecetaEditor
      receta={VACIA}
      esNueva
      onCerrar={() => router.push('/recetas')}
      onEliminada={() => router.push('/recetas')}
      onGuardada={(id) => router.push(`/recetas/${id}`)}
    />
  )
}
