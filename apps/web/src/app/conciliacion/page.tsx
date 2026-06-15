'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { useUser } from '@/hooks/use-user'
import { DateRange } from '@/components/sales/date-range'
import { defaultRange } from '@/components/sales/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HelpCircle } from 'lucide-react'
import { CoberturaCard } from '@/components/conciliacion/cobertura-card'
import { ConciliacionTable, type ConciliacionItem } from '@/components/conciliacion/conciliacion-table'
import { MargenTable, type MargenProducto } from '@/components/conciliacion/margen-table'

interface ConciliacionResponse {
  items: ConciliacionItem[]
  umbralPct: number
  cobertura: {
    coberturaPct: number
    unidadesTotales: number
    unidadesConReceta: number
    productosSinReceta: Array<{ productMasterId: string; nombre: string; unidades: number; importe: number }>
    insumosSinCompra: Array<{ insumoId: string; nombre: string; consumoTeorico: number; unidadBase: string }>
  }
  sucursales: string[]
}

export default function ConciliacionPage() {
  const { isLoading } = useUser()
  const [{ from, to }, setRange] = useState(defaultRange())
  const [sucursal, setSucursal] = useState('')
  const [umbral, setUmbral] = useState('15')

  const params = useMemo(() => {
    const p = new URLSearchParams({ from, to, umbralPct: umbral })
    if (sucursal) p.set('sucursal', sucursal)
    return p.toString()
  }, [from, to, sucursal, umbral])

  const { data, isLoading: loadingConc, isFetching } = useQuery({
    queryKey: ['conciliacion', params],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion?${params}`)
      if (!res.ok) throw new Error('Error cargando conciliación')
      return res.json() as Promise<ConciliacionResponse>
    },
    enabled: !isLoading,
    staleTime: 30_000,
  })

  const margenParams = useMemo(() => {
    const p = new URLSearchParams({ from, to })
    if (sucursal) p.set('sucursal', sucursal)
    return p.toString()
  }, [from, to, sucursal])

  const { data: margenData, isLoading: loadingMargen } = useQuery({
    queryKey: ['conciliacion-margen', margenParams],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/margen?${margenParams}`)
      if (!res.ok) throw new Error('Error cargando margen')
      return res.json() as Promise<{ productos: MargenProducto[] }>
    },
    enabled: !isLoading,
    staleTime: 30_000,
  })

  if (isLoading) return null

  const incidencias = data?.items.filter((i) => i.incidencia).length ?? 0

  return (
    <DashboardLayout>
      <Header
        title="Conciliación compra-venta"
        description="Compara el consumo teórico (ventas × receta) contra lo comprado por período, y detecta diferencias e incidencias. Las compras se cuentan sobre facturas confirmadas o pagadas."
      />

      {/* Controles */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <DateRange
          from={from}
          to={to}
          onChange={setRange}
          sucursales={data?.sucursales}
          sucursal={sucursal}
          onSucursalChange={setSucursal}
        />
        <label
          className="flex items-center gap-1.5 text-sm text-slate-600"
          title="Diferencia % entre lo comprado y el consumo teórico a partir de la cual una fila se marca como incidencia (posible merma, robo, error de receta o de carga). Ej: 15% = se resaltan los insumos que difieren más de un 15%."
        >
          Umbral incidencia
          <input
            type="number"
            value={umbral}
            onChange={(e) => setUmbral(e.target.value)}
            className="w-16 border border-slate-200 rounded-md px-2 py-1.5 text-sm"
          />
          %
          <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
        </label>
      </div>

      <Tabs defaultValue="insumos">
        <TabsList>
          <TabsTrigger value="insumos">
            Por insumo {incidencias > 0 && <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">{incidencias}</span>}
          </TabsTrigger>
          <TabsTrigger value="margen">Margen por producto</TabsTrigger>
        </TabsList>

        <TabsContent value="insumos" className="mt-6">
          <div className="mb-4 flex items-start gap-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-500">
            <HelpCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <p>
              Compara <span className="font-medium text-slate-600">flujos</span> del período: como las compras vienen en lote,
              un excedente (badge <span className="font-medium">stock</span>) suele ser inventario, no merma —miralo sobre un ciclo de reposición completo.
              Un <span className="font-medium text-amber-700">faltante</span> (consumiste más de lo comprado) sí es sospechoso. Para ver el desvío contra el inventario real, cargá conteos de stock en cada insumo.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
            <div>
              {loadingConc || isFetching ? (
                <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-sm">Cargando...</div>
              ) : (
                <ConciliacionTable items={data?.items ?? []} />
              )}
            </div>
            {data?.cobertura && <CoberturaCard cobertura={data.cobertura} />}
          </div>
        </TabsContent>

        <TabsContent value="margen" className="mt-6">
          {loadingMargen ? (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-sm">Cargando...</div>
          ) : (
            <MargenTable productos={margenData?.productos ?? []} />
          )}
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  )
}
