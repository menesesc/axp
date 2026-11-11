'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChefHat, Plus } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { avisarError, enviar } from '@/components/eventos/comunes'
import { usePlantillas } from '@/components/eventos/menu-tab'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { cn } from '@/lib/utils'

/**
 * Biblioteca de menús fijos. Al asignar uno a un evento o una reserva se
 * copia: cambiar una plantilla no toca lo que ya se presupuestó.
 */
export default function MenusPage() {
  const router = useRouter()
  const { canEdit } = useUser()
  const puedeEditar = canEdit(SECCION.EVENTOS_RESERVAS)
  const { data, isLoading } = usePlantillas()
  const [nombre, setNombre] = useState('')
  const [verArchivados, setVerArchivados] = useState(false)

  const crear = useMutation({
    mutationFn: () => enviar('/api/eventos/menus', 'POST', { nombre }),
    onSuccess: (m: { id: string }) => {
      toast.success('Menú creado')
      router.push(`/eventos/menus/${m.id}` as Route)
    },
    onError: avisarError,
  })

  const todas = data?.plantillas ?? []
  const lista = todas.filter((p) => verArchivados || p.activo)

  return (
    <DashboardLayout>
      <Header title="Menús" description="Menús fijos para eventos y grupos. Se copian al asignarlos." compacto />
      <div className="max-w-4xl space-y-4">
        {puedeEditar && (
          <form
            className="ax-card flex flex-wrap gap-2 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (nombre.trim()) crear.mutate()
            }}
          >
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del menú nuevo (Menú Fin de Año, Menú agencia…)" className="min-w-[14rem] flex-1" />
            <Button type="submit" className="gap-1.5" disabled={!nombre.trim() || crear.isPending}>
              <Plus className="h-4 w-4" />
              Crear menú
            </Button>
          </form>
        )}

        <div className="ax-card divide-y divide-slate-900/[0.05]">
          {isLoading && <div className="h-24 animate-pulse" />}
          {!isLoading && lista.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-[var(--ter)]">
              <ChefHat className="h-6 w-6" />
              Todavía no hay menús. Armá el primero con productos de la carta del POS.
            </div>
          )}
          {lista.map((p) => (
            <Link key={p.id} href={`/eventos/menus/${p.id}` as Route} className={cn('flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50', !p.activo && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {p.nombre}
                  {!p.activo && <span className="ml-2 text-xs font-normal text-[var(--ter)]">archivado</span>}
                </p>
                {p.descripcion && <p className="truncate text-xs text-[var(--ter)]">{p.descripcion}</p>}
              </div>
              <span className="text-xs text-[var(--sec)]">
                {p.items} ítem{p.items === 1 ? '' : 's'} · usado en {p.copias} evento{p.copias === 1 ? '' : 's'} o reserva{p.copias === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
        {todas.some((p) => !p.activo) && (
          <label className="flex items-center gap-2 text-xs text-[var(--sec)]">
            <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
            Ver archivados
          </label>
        )}
      </div>
    </DashboardLayout>
  )
}
