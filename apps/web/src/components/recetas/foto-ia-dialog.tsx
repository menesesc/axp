'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VajillaReceta } from './tipos'

/**
 * Lo que la IA necesita saber para la foto del plato.
 *
 * Dos cosas cambian el resultado más que ninguna otra: la vajilla —un guiso
 * en cazuela de cerámica y el mismo guiso en plato playo no son la misma
 * foto— y lo que el cocinero pida esta vez: el perejil arriba, el gratinado
 * dorado, verlo desde arriba en vez de a 45 grados.
 *
 * Con una foto ya cargada se puede retocar esa misma en vez de empezar de
 * cero: es la diferencia entre "a ver si sale mejor" y "esta, pero desde
 * arriba".
 */

export interface PedidoFoto {
  vajillaId: string | null
  indicaciones: string
  /** Partir de la foto actual en vez de generar una nueva. */
  retocar: boolean
}

const EJEMPLOS = [
  'Agregá un detalle de perejil fresco',
  'Gratinado bien dorado',
  'Vista superior',
  'De perfil, a la altura del plato',
  'Primer plano del corte',
  'Con la guarnición al costado',
  'Salsa espejada en la base',
]

export function FotoIaDialog({
  abierto,
  onCerrar,
  vajillas,
  vajillaInicial,
  hayFoto,
  generando,
  onGenerar,
}: {
  abierto: boolean
  onCerrar: () => void
  vajillas: VajillaReceta[]
  vajillaInicial: string | null
  hayFoto: boolean
  generando: boolean
  onGenerar: (p: PedidoFoto) => void
}) {
  const [vajillaId, setVajillaId] = useState(vajillaInicial ?? '')
  const [indicaciones, setIndicaciones] = useState('')
  const [retocar, setRetocar] = useState(false)

  useEffect(() => {
    if (abierto) {
      setVajillaId(vajillaInicial ?? '')
      setRetocar(false)
    }
  }, [abierto, vajillaInicial])

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Foto del plato
          </DialogTitle>
        </DialogHeader>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Vajilla</span>
          <select
            value={vajillaId}
            onChange={(e) => setVajillaId(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Que la elija la IA</option>
            {vajillas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.emoji ? `${v.emoji} ` : ''}{v.nombre}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-400">
            Se guarda con la receta cuando guardes: es parte del emplatado.
          </span>
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Decoración, presentación o ángulo <span className="font-normal text-slate-400">— opcional</span>
          </label>
          <textarea
            rows={3}
            value={indicaciones}
            onChange={(e) => setIndicaciones(e.target.value)}
            placeholder="Agregá un detalle de perejil. Vista superior."
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {EJEMPLOS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIndicaciones((v) => (v ? `${v.replace(/\.?\s*$/, '')}. ${e}` : e))}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"
              >
                + {e}
              </button>
            ))}
          </div>
        </div>

        {hayFoto && (
          <label className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm',
            retocar ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200')}>
            <input
              type="checkbox"
              checked={retocar}
              onChange={(e) => setRetocar(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              Retocar la foto actual
              <span className="block text-xs text-slate-500">
                Mantiene el plato y el emplatado, y aplica sólo lo que pediste arriba.
              </span>
            </span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button
            onClick={() => onGenerar({ vajillaId: vajillaId || null, indicaciones, retocar })}
            disabled={generando}
          >
            {generando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {retocar ? 'Retocar foto' : 'Generar foto'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
