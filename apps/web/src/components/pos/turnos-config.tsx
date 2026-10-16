'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2 } from 'lucide-react'
import { TURNOS_POR_DEFECTO, type Turno } from '@/lib/pos/turnos'

/**
 * Los turnos del día, como los nombra la casa.
 *
 * "Turno 1" no le dice nada a nadie: el que mira la pantalla de la caja
 * piensa en mañana, mediodía, tarde o noche. Cuál es se deduce de la hora en
 * que se abrió la caja, y por eso cada cliente parte el día a su manera: un
 * bar de playa y un restaurante de centro no tienen los mismos horarios.
 */
export function TurnosConfig() {
  const qc = useQueryClient()
  const [turnos, setTurnos] = useState<Turno[]>(TURNOS_POR_DEFECTO)

  const { data } = useQuery({
    queryKey: ['pos-configuracion'],
    queryFn: async () =>
      (await fetch('/api/pos/configuracion')).json() as Promise<{ configuracion: { turnos: Turno[] } }>,
  })

  useEffect(() => {
    if (data?.configuracion?.turnos?.length) setTurnos(data.configuracion.turnos)
  }, [data])

  const guardar = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pos/configuracion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnos }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-configuracion'] })
      qc.invalidateQueries({ queryKey: ['pos-sesion'] })
      toast.success('Turnos guardados')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const set = (i: number, campo: keyof Turno, valor: string) =>
    setTurnos((ts) => ts.map((t, k) => (k === i ? { ...t, [campo]: valor } : t)))

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="font-semibold">Turnos del día</p>
      <p className="mb-3 text-sm text-slate-500">
        Cómo se llama cada turno y desde qué hora. La caja muestra el nombre según cuándo se abrió.
      </p>

      <div className="space-y-2">
        {turnos.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={t.nombre}
              onChange={(e) => set(i, 'nombre', e.target.value)}
              placeholder="Mediodía"
              className="h-10 max-w-[14rem] flex-1 text-sm"
            />
            <span className="text-xs text-slate-400">desde</span>
            <Input
              value={t.desde}
              onChange={(e) => set(i, 'desde', e.target.value)}
              placeholder="11:00"
              className="h-10 w-24 text-center text-sm tabular-nums"
            />
            <button
              onClick={() => setTurnos((ts) => ts.filter((_, k) => k !== i))}
              aria-label="Sacar"
              className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setTurnos((ts) => [...ts, { nombre: '', desde: '00:00' }])}
        >
          <Plus className="h-4 w-4" /> Agregar turno
        </Button>
        <Button size="sm" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          Guardar
        </Button>
      </div>
    </section>
  )
}
