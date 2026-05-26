'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { PaymentOrdersTable } from '@/components/payments/payment-orders-table'
import { UpcomingPayments } from '@/components/payments/upcoming-payments'
import { ReconciliationDialog } from '@/components/payments/reconciliation-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUser } from '@/hooks/use-user'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  FileEdit,
  Send,
  CheckCircle2,
  CalendarClock,
} from 'lucide-react'

interface PaymentOrder {
  id: string
  numero: number
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

interface PagosStats {
  estados: {
    BORRADOR: { count: number; total: number }
    EMITIDA: { count: number; total: number }
    PAGADO: { count: number; total: number }
  }
  pagadoMes: { count: number; total: number }
  proximos7: { total: number; cantidad: number }
}

export default function PagosPage() {
  const queryClient = useQueryClient()
  const { clienteId, isAdmin } = useUser()

  const [estado, setEstado] = useState('')
  const [proveedorSearch, setProveedorSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reconciliationOpen, setReconciliationOpen] = useState(false)
  const pageSize = 25

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(proveedorSearch)
      setPage(1)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [proveedorSearch])

  const { data, isLoading } = useQuery<PagosResponse>({
    queryKey: ['pagos', clienteId, page, estado, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (estado) params.append('estado', estado)
      if (debouncedSearch) params.append('q', debouncedSearch)

      const res = await fetch(`/api/pagos?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const { data: stats } = useQuery<PagosStats>({
    queryKey: ['pagos-stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/pagos/stats')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 30_000,
  })

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
      queryClient.invalidateQueries({ queryKey: ['pagos-stats'] })
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
      queryClient.invalidateQueries({ queryKey: ['pagos-stats'] })
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

  const estados = stats?.estados
  const emitidas = estados?.EMITIDA
  const borradores = estados?.BORRADOR
  const pagadoMes = stats?.pagadoMes
  const proximos = stats?.proximos7

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Header
          title="Pagos"
          description={pagination ? `${pagination.total} órdenes de pago` : undefined}
          actions={
            isAdmin && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setReconciliationOpen(true)}
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Conciliación IA
                </Button>
                <Button variant="primary" asChild>
                  <Link href="/pagos/nueva">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Nueva orden
                  </Link>
                </Button>
              </div>
            )
          }
        />

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="A pagar (emitidas)"
            value={formatCurrency(emitidas?.total ?? 0)}
            hint={`${emitidas?.count ?? 0} órdenes pendientes`}
            icon={<Send className="h-4 w-4" />}
            tone="blue"
            active={estado === 'EMITIDA'}
            onClick={() => {
              setEstado(estado === 'EMITIDA' ? '' : 'EMITIDA')
              setPage(1)
            }}
          />
          <StatCard
            label="Próximos 7 días"
            value={formatCurrency(proximos?.total ?? 0)}
            hint={`${proximos?.cantidad ?? 0} órdenes con vencimiento`}
            icon={<CalendarClock className="h-4 w-4" />}
            tone="amber"
          />
          <StatCard
            label="Borradores"
            value={formatCurrency(borradores?.total ?? 0)}
            hint={`${borradores?.count ?? 0} sin emitir`}
            icon={<FileEdit className="h-4 w-4" />}
            tone="slate"
            active={estado === 'BORRADOR'}
            onClick={() => {
              setEstado(estado === 'BORRADOR' ? '' : 'BORRADOR')
              setPage(1)
            }}
          />
          <StatCard
            label="Pagado este mes"
            value={formatCurrency(pagadoMes?.total ?? 0)}
            hint={`${pagadoMes?.count ?? 0} órdenes liquidadas`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="emerald"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
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

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Buscar proveedor..."
              value={proveedorSearch}
              onChange={(e) => setProveedorSearch(e.target.value)}
              className="pl-8 w-52 h-9 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
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

          <div className="lg:col-span-1">
            <UpcomingPayments />
          </div>
        </div>
      </div>

      <ReconciliationDialog
        open={reconciliationOpen}
        onOpenChange={setReconciliationOpen}
      />
    </DashboardLayout>
  )
}

type Tone = 'blue' | 'amber' | 'slate' | 'emerald'

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ReactNode
  tone: Tone
  active?: boolean
  onClick?: () => void
}) {
  const toneMap: Record<Tone, { iconWrap: string; ring: string }> = {
    blue: {
      iconWrap: 'bg-blue-50 text-blue-600',
      ring: 'ring-blue-300',
    },
    amber: {
      iconWrap: 'bg-amber-50 text-amber-600',
      ring: 'ring-amber-300',
    },
    slate: {
      iconWrap: 'bg-slate-100 text-slate-600',
      ring: 'ring-slate-300',
    },
    emerald: {
      iconWrap: 'bg-emerald-50 text-emerald-600',
      ring: 'ring-emerald-300',
    },
  }
  const t = toneMap[tone]

  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums truncate">
          {value}
        </p>
        {hint && (
          <p className="text-xs text-slate-400 mt-1 truncate">{hint}</p>
        )}
      </div>
      <div className={`shrink-0 rounded-md p-2 ${t.iconWrap}`}>
        {icon}
      </div>
    </div>
  )

  const baseCls =
    'block rounded-lg border bg-white shadow-sm p-4 text-left transition-all'

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseCls} hover:shadow-md hover:border-slate-300 w-full ${
          active ? `ring-2 ${t.ring} border-transparent` : 'border-slate-200'
        }`}
      >
        {content}
      </button>
    )
  }
  return <div className={`${baseCls} border-slate-200`}>{content}</div>
}
