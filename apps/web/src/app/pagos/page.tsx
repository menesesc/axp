'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { PaymentOrdersTable } from '@/components/payments/payment-orders-table'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUser } from '@/hooks/use-user'
import { toast } from 'sonner'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'

interface PaymentOrder {
  id: string
  fecha: string
  estado: 'BORRADOR' | 'EMITIDA' | 'PAGADO'
  montoTotal: number
  proveedor: {
    id: string
    razonSocial: string
  }
  metodos: Array<{
    id: string
    tipo: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'ECHEQ'
    monto: number
  }>
  documentosCount: number
}

interface PagosResponse {
  pagos: PaymentOrder[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export default function PagosPage() {
  const queryClient = useQueryClient()
  const { clienteId, isAdmin } = useUser()

  const [estado, setEstado] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 25

  const { data, isLoading } = useQuery<PagosResponse>({
    queryKey: ['pagos', clienteId, page, estado, proveedorId],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (estado) params.append('estado', estado)
      if (proveedorId) params.append('proveedorId', proveedorId)

      const res = await fetch(`/api/pagos?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const proveedores = proveedoresData?.proveedores?.filter(
    (p: { activo: boolean }) => p.activo
  ) || []

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pagos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'PAGADO' }),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      toast.success('Orden marcada como pagada')
    },
    onError: () => {
      toast.error('Error al actualizar la orden')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pagos/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      toast.success('Orden eliminada')
    },
    onError: () => {
      toast.error('Error al eliminar la orden')
    },
  })

  const handleExportPdf = (_id: string) => {
    toast.info('Exportación a PDF próximamente')
  }

  const orders = data?.pagos || []
  const pagination = data?.pagination

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">
          No tienes acceso
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Header
          title="Pagos"
          description={pagination ? `${pagination.total} órdenes de pago` : undefined}
          actions={
            isAdmin && (
              <Button variant="primary" asChild>
                <Link href="/pagos/nueva">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nueva orden
                </Link>
              </Button>
            )
          }
        />

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Tabs
            value={estado || 'all'}
            onValueChange={(v) => {
              setEstado(v === 'all' ? '' : v)
              setPage(1)
            }}
          >
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="BORRADOR">Borrador</TabsTrigger>
              <TabsTrigger value="EMITIDA">Emitidas</TabsTrigger>
              <TabsTrigger value="PAGADO">Pagadas</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select
            value={proveedorId || 'all'}
            onValueChange={(v) => {
              setProveedorId(v === 'all' ? '' : v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos los proveedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              {proveedores.map((p: { id: string; razonSocial: string }) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.razonSocial}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <PaymentOrdersTable
          orders={orders}
          isLoading={isLoading}
          onMarkPaid={(id) => markPaidMutation.mutate(id)}
          onDelete={(id) => deleteMutation.mutate(id)}
          onExportPdf={handleExportPdf}
        />

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Mostrando {(pagination.page - 1) * pageSize + 1} a{' '}
              {Math.min(pagination.page * pageSize, pagination.total)} de{' '}
              {pagination.total} resultados
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-slate-500 px-2">
                {pagination.page} / {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.pages}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
