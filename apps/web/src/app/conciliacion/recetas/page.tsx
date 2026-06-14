'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { useUser } from '@/hooks/use-user'
import { Input } from '@/components/ui/input'
import { RecipeEditor } from '@/components/conciliacion/recipe-editor'
import { fmtNumAR } from '@/components/sales/shared'
import { BookOpen, Search, CheckCircle2 } from 'lucide-react'

interface Producto {
  id: string
  nombre: string
  rubroNombre: string | null
  tieneReceta: boolean
  ingredientesCount: number
  unidadesVendidas: number
}

type Filter = 'all' | 'sin' | 'con'

export default function RecetasPage() {
  const { isAdmin, isLoading } = useUser()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading: loading } = useQuery({
    queryKey: ['conciliacion-productos'],
    queryFn: async () => {
      const res = await fetch('/api/conciliacion/productos')
      if (!res.ok) throw new Error('Error cargando productos')
      return res.json() as Promise<{ productos: Producto[] }>
    },
  })

  if (isLoading) return null

  const productos = (data?.productos ?? [])
    .filter((p) => p.nombre.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((p) => (filter === 'sin' ? !p.tieneReceta : filter === 'con' ? p.tieneReceta : true))

  const conReceta = data?.productos.filter((p) => p.tieneReceta).length ?? 0
  const total = data?.productos.length ?? 0

  return (
    <DashboardLayout>
      <Header
        title="Recetas"
        description="Cargá la fórmula de cada producto de venta: qué insumos consume y en qué cantidad. Es la base del consumo teórico."
      />

      <div className="mb-4 flex items-center gap-3 text-sm text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          {conReceta} de {total} productos con receta
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
        {/* Lista de productos */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." className="pl-8 text-sm" />
            </div>
            <div className="inline-flex bg-slate-100 rounded-lg p-0.5 text-sm">
              {([['all', 'Todos'], ['sin', 'Sin receta'], ['con', 'Con receta']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`px-3 py-1 rounded-md transition ${filter === k ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
          ) : productos.length === 0 ? (
            <div className="p-10 text-center">
              <BookOpen className="h-9 w-9 mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-sm">Sin productos</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {productos.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition flex items-center justify-between gap-2 ${
                      selectedId === p.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="text-sm text-slate-800 block truncate">{p.nombre}</span>
                      <span className="text-[11px] text-slate-400">
                        {p.rubroNombre ?? 'Sin rubro'} · {fmtNumAR(p.unidadesVendidas)} u vendidas
                      </span>
                    </span>
                    {p.tieneReceta ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {p.ingredientesCount}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] text-slate-300">sin receta</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Editor */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          {selectedId ? (
            <RecipeEditor productMasterId={selectedId} canEdit={isAdmin} />
          ) : (
            <div className="h-full flex items-center justify-center text-center text-slate-400 text-sm py-16">
              Seleccioná un producto para cargar o editar su receta.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
