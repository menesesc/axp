'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ReportLayout } from '@/components/informes/report-layout'
import { useUser } from '@/hooks/use-user'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ReportFilters } from '@/components/informes/report-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DollarSign,
  ArrowLeft,
  FileText,
} from 'lucide-react'

const tipoLabels: Record<string, string> = {
  FACTURA: 'Factura',
  NOTA_CREDITO: 'Nota de Crédito',
  PAGO: 'Pago',
}

export default function CuentaCorrientePage() {
  const { clienteId } = useUser()
  const today = new Date()
  const yearStart = new Date(today.getFullYear(), 0, 1)

  const [filters, setFilters] = useState<ReportFilters>({
    desde: yearStart.toISOString().split('T')[0]!,
    hasta: today.toISOString().split('T')[0]!,
    proveedorId: '',
  })

  const { data: proveedoresData } = useQuery<{ proveedores: any[] }>({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 60000,
  })

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filters.desde) params.set('desde', filters.desde)
    if (filters.hasta) params.set('hasta', filters.hasta)
    if (filters.proveedorId) params.set('proveedorId', filters.proveedorId)
    return params.toString()
  }, [filters])

  const { data, isLoading } = useQuery({
    queryKey: ['informe-cuenta-corriente', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/informes/cuenta-corriente?${queryString}`)
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
    enabled: !!clienteId && !!filters.desde && !!filters.hasta,
    staleTime: 60000,
  })

  // Calcular saldo acumulado para la vista de movimientos
  const movimientosConSaldo = useMemo(() => {
    if (!data?.movimientos) return []
    let saldo = data.saldoInicial || 0
    return data.movimientos.map((m: any) => {
      saldo += m.debe - m.haber
      return { ...m, saldo }
    })
  }, [data?.movimientos, data?.saldoInicial])

  const totalDebe = movimientosConSaldo.reduce((s: number, m: any) => s + m.debe, 0)
  const totalHaber = movimientosConSaldo.reduce((s: number, m: any) => s + m.haber, 0)
  const saldoFinal = movimientosConSaldo.length > 0
    ? movimientosConSaldo[movimientosConSaldo.length - 1].saldo
    : (data?.saldoInicial || 0)

  return (
    <ReportLayout
      title="Cuenta Corriente"
      description="Estado de cuenta por proveedor"
      filters={filters}
      onFiltersChange={setFilters}
      showProveedorFilter
      proveedores={proveedoresData?.proveedores || []}
    >
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : !filters.proveedorId && data?.saldos ? (
        /* Vista resumen: todos los proveedores */
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="p-5 border-b">
            <h3 className="font-semibold text-slate-900">Saldos por Proveedor</h3>
            <p className="text-sm text-slate-500">Seleccione un proveedor para ver el detalle</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-600">Proveedor</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Facturado</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Notas de Crédito</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Pagado</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.saldos.map((s: any) => (
                <tr
                  key={s.proveedor_id}
                  className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setFilters({ ...filters, proveedorId: s.proveedor_id })}
                >
                  <td className="px-5 py-3">
                    <span className="font-medium text-blue-600 hover:underline">{s.razon_social}</span>
                  </td>
                  <td className="px-5 py-3 text-right">{formatCurrency(s.total_facturado)}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">
                    {s.total_nc > 0 ? `-${formatCurrency(s.total_nc)}` : '-'}
                  </td>
                  <td className="px-5 py-3 text-right text-emerald-600">
                    {s.total_pagado > 0 ? formatCurrency(s.total_pagado) : '-'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-bold ${s.saldo > 0 ? 'text-red-600' : s.saldo < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {formatCurrency(s.saldo)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3 text-right">
                  {formatCurrency(data.saldos.reduce((s: number, r: any) => s + r.total_facturado, 0))}
                </td>
                <td className="px-5 py-3 text-right text-emerald-600">
                  -{formatCurrency(data.saldos.reduce((s: number, r: any) => s + r.total_nc, 0))}
                </td>
                <td className="px-5 py-3 text-right text-emerald-600">
                  {formatCurrency(data.saldos.reduce((s: number, r: any) => s + r.total_pagado, 0))}
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="text-red-600">
                    {formatCurrency(data.saldos.reduce((s: number, r: any) => s + r.saldo, 0))}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : data?.movimientos !== undefined ? (
        /* Vista detalle: un proveedor */
        <div className="space-y-4">
          <div className="flex items-center gap-3 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => setFilters({ ...filters, proveedorId: '' })}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            {data.proveedor && (
              <div>
                <h3 className="font-semibold">{data.proveedor.razonSocial}</h3>
                {data.proveedor.cuit && <p className="text-xs text-slate-500">CUIT: {data.proveedor.cuit}</p>}
              </div>
            )}
          </div>

          {/* KPIs del proveedor */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-slate-500">Saldo Anterior</p>
              <p className="text-xl font-bold">{formatCurrency(data.saldoInicial || 0)}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-slate-500">Debe (Facturas)</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalDebe)}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-slate-500">Haber (Pagos + NC)</p>
              <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalHaber)}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-slate-500">Saldo Actual</p>
              <p className={`text-xl font-bold ${saldoFinal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatCurrency(saldoFinal)}
              </p>
            </div>
          </div>

          {/* Tabla de movimientos */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Fecha</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Tipo</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Referencia</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Debe</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Haber</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.saldoInicial !== 0 && (
                  <tr className="border-b bg-slate-50/50 italic text-slate-500">
                    <td className="px-5 py-2.5" colSpan={5}>Saldo anterior</td>
                    <td className="px-5 py-2.5 text-right font-medium">{formatCurrency(data.saldoInicial)}</td>
                  </tr>
                )}
                {movimientosConSaldo.map((m: any, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-2.5 whitespace-nowrap">{formatDate(m.fecha)}</td>
                    <td className="px-5 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        m.tipo === 'FACTURA' ? 'bg-blue-100 text-blue-700' :
                        m.tipo === 'NOTA_CREDITO' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {tipoLabels[m.tipo] || m.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-medium">{m.referencia}</td>
                    <td className="px-5 py-2.5 text-right text-red-600">
                      {m.debe > 0 ? formatCurrency(m.debe) : ''}
                    </td>
                    <td className="px-5 py-2.5 text-right text-emerald-600">
                      {m.haber > 0 ? formatCurrency(m.haber) : ''}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium">
                      {formatCurrency(m.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold">
                  <td className="px-5 py-3" colSpan={3}>Totales</td>
                  <td className="px-5 py-3 text-right text-red-600">{formatCurrency(totalDebe)}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">{formatCurrency(totalHaber)}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(saldoFinal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {movimientosConSaldo.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>Sin movimientos en el período seleccionado</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          <DollarSign className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p>Seleccione un proveedor o vea el resumen de saldos</p>
        </div>
      )}
    </ReportLayout>
  )
}
