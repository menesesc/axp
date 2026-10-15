'use client'

import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DispositivoReceta } from './tipos'

/**
 * Lo que la IA necesita saber antes de escribir la receta.
 *
 * Antes el botón tomaba lo que hubiera en el formulario, así que si todavía
 * no habías bajado a elegir dispositivos ni porciones, la receta salía con
 * los valores por defecto y había que rehacerla. Acá se pregunta todo junto,
 * en el momento de pedirla.
 *
 * Las indicaciones libres son lo que más cambia el resultado: "terminar en
 * parrilla", "la salsa sin ligante ni emulsionante", "sin TACC". Es la
 * diferencia entre una receta genérica y la de esta cocina.
 */

export interface Sugerencia {
  descripcion: string
  prepMin: number | null
  totalMin: number | null
  dificultad: string | null
  dispositivoIds: string[]
  ingredientes: Array<{
    nombre: string
    cantidad: number | null
    unidad: string | null
    nota: string | null
    seccion: string | null
  }>
  pasos: Array<{ texto: string; seccion: string | null }>
  sugerencias: string[]
}

const EJEMPLOS = [
  'Terminar en parrilla',
  'La salsa sin ligante ni emulsionante',
  'Sin TACC',
  'Dejar la base hecha del día anterior',
  'Emplatado individual',
]

export function SugerirDialog({
  abierto,
  onCerrar,
  tituloInicial,
  porcionesIniciales,
  dispositivosIniciales,
  dispositivos,
  onSugerencia,
}: {
  abierto: boolean
  onCerrar: () => void
  tituloInicial: string
  porcionesIniciales: number
  dispositivosIniciales: string[]
  dispositivos: DispositivoReceta[]
  onSugerencia: (s: Sugerencia, porciones: number, conFoto: boolean, titulo: string) => void
}) {
  const [titulo, setTitulo] = useState(tituloInicial)
  const [porciones, setPorciones] = useState(String(porcionesIniciales || 10))
  const [elegidos, setElegidos] = useState<string[]>(dispositivosIniciales)
  const [indicaciones, setIndicaciones] = useState('')
  const [conFoto, setConFoto] = useState(true)

  useEffect(() => {
    if (abierto) {
      setTitulo(tituloInicial)
      setPorciones(String(porcionesIniciales || 10))
      setElegidos(dispositivosIniciales)
    }
  }, [abierto, tituloInicial, porcionesIniciales, dispositivosIniciales])

  const pedir = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/recetas/sugerir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          porciones: Number(porciones) || 10,
          dispositivoIds: elegidos,
          indicaciones,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo sugerir')
      return json.sugerencia as Sugerencia
    },
    onSuccess: (s) => {
      // El título va de vuelta: si lo corrigieron acá, el formulario tiene
      // que quedar con ese y no con el que traía.
      onSugerencia(s, Number(porciones) || 10, conFoto, titulo.trim())
      onCerrar()
      toast.success('Borrador listo. Revisalo antes de guardar.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const alternar = (id: string) =>
    setElegidos((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Sugerir receta
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">Plato</span>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Milanesa de bife con papas" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">Porciones</span>
            <Input
              value={porciones}
              onChange={(e) => setPorciones(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">
            Dispositivos{' '}
            <span className="font-normal text-slate-400">
              — si no marcás ninguno, los elige según el plato
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {dispositivos.map((d) => {
              const on = elegidos.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => alternar(d.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition',
                    on
                      ? 'border-violet-300 bg-violet-50 font-medium text-violet-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {d.emoji} {d.nombre}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Cómo la querés <span className="font-normal text-slate-400">— opcional</span>
          </label>
          <textarea
            rows={3}
            value={indicaciones}
            onChange={(e) => setIndicaciones(e.target.value)}
            placeholder="Terminar en parrilla. La salsa sin ligante ni emulsionante."
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

        {/* La foto tarda bastante más que el texto, así que se pide junto
            con la receta y se va cargando sola mientras se revisa. */}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={conFoto}
            onChange={(e) => setConFoto(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Sugerir también una foto del plato
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => pedir.mutate()} disabled={pedir.isPending || !titulo.trim()}>
            {pedir.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pensando…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generar borrador
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
