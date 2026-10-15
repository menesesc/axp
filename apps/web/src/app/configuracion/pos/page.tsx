'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CatalogoTab } from '@/components/pos/catalogo-tab'
import { UsuariosTab } from '@/components/pos/usuarios-tab'
import { EstructuraTab } from '@/components/pos/estructura-tab'
import { cn } from '@/lib/utils'
import { Building2, Package, Users } from 'lucide-react'

/**
 * Administración del punto de venta.
 *
 * Tres cosas que hay que tener cargadas antes de poder vender: qué se vende,
 * quién vende y desde dónde. Van juntas porque se configuran de una vez, al
 * poner en marcha un local.
 */

type Tab = 'catalogo' | 'usuarios' | 'estructura'

export default function PosConfigPage() {
  const [tab, setTab] = useState<Tab>('catalogo')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['pos-catalogo'],
    queryFn: async () => {
      const res = await fetch('/api/pos/catalogo')
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo cargar')
      return res.json()
    },
  })

  // Siembra desde lo que ya se vende por Maxirest: 271 productos con su rubro
  // y su último precio. Cargarlos a mano no es razonable.
  const importar = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pos/catalogo/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo importar')
      return json as { categorias: number; productos: number }
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['pos-catalogo'] })
      toast.success(`${r.productos} productos y ${r.categorias} categorías importados`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { data: previa } = useQuery({
    queryKey: ['pos-catalogo-previa'],
    queryFn: async () => {
      const res = await fetch('/api/pos/catalogo/importar')
      if (!res.ok) return null
      return res.json() as Promise<{ resumen: { nuevos: number; total: number } }>
    },
  })

  const TABS = [
    ['catalogo', 'Catálogo', Package, data?.productos?.length ?? 0],
    ['usuarios', 'Usuarios', Users, null],
    ['estructura', 'Sucursales y cajas', Building2, null],
  ] as const

  return (
    <DashboardLayout>
      <Header
        title="Punto de venta"
        description="Qué se vende, quién vende y desde dónde. Es lo que hay que tener cargado antes de la primera venta."
        actions={
          (previa?.resumen.nuevos ?? 0) > 0 ? (
            <Button onClick={() => importar.mutate()} disabled={importar.isPending} size="sm">
              {importar.isPending ? 'Importando…' : `Importar ${previa!.resumen.nuevos} productos de Maxirest`}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5">
        {TABS.map(([v, l, Icono, n]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
              tab === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
            )}
          >
            <Icono className="h-4 w-4" />
            {l}
            {n ? <span className={cn('text-xs', tab === v ? 'text-white/60' : 'text-slate-400')}>{n}</span> : null}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <>
          {tab === 'catalogo' && <CatalogoTab data={data} />}
          {tab === 'usuarios' && <UsuariosTab />}
          {tab === 'estructura' && <EstructuraTab />}
        </>
      )}
    </DashboardLayout>
  )
}
