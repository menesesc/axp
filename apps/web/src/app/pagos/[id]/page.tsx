'use client'

import { use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { PaymentMethodBadge, type PaymentMethod } from '@/components/ui/payment-method-badge'
import { ConfidenceBadge } from '@/components/ui/confidence-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useUser } from '@/hooks/use-user'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { ArrowLeft, Edit, CheckCircle, Download, Trash2 } from 'lucide-react'

interface Documento {
  id: string
  tipo: string
  letra: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  total: number | null
  confidenceScore: number | null
  montoAplicado: number
}

interface PaymentMethodItem {
  id: string
  tipo: PaymentMethod
  monto: number
  fecha: string
  referencia: string | null
}

interface Pago {
  id: string
  fecha: string
  estado: 'BORRADOR' | 'EMITIDA' | 'PAGADO'
  montoTotal: number
  nota: string | null
  proveedor: {
    id: string
    razonSocial: string
    cuit: string | null
  }
  metodos: PaymentMethodItem[]
  documentos: Documento[]
}

export default function PagoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { clienteId, isAdmin } = useUser()

  const { data, isLoading } = useQuery<{ pago: Pago }>({
    queryKey: ['pago', id],
    queryFn: async () => {
      const res = await fetch(`/api/pagos/${id}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId && !!id,
  })

  const updateMutation = useMutation({
    mutationFn: async (estado: string) => {
      const res = await fetch(`/api/pagos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pago', id] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      toast.success('Orden actualizada')
    },
    onError: () => {
      toast.error('Error al actualizar la orden')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pagos/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      toast.success('Orden eliminada')
      router.push('/pagos')
    },
    onError: () => {
      toast.error('Error al eliminar la orden')
    },
  })

  const pago = data?.pago

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">
          No tienes acceso
        </div>
      </DashboardLayout>
    )
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    )
  }

  if (!pago) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">
          Orden no encontrada
        </div>
      </DashboardLayout>
    )
  }

  const totalDocumentos = pago.documentos.reduce((sum, d) => sum + d.montoAplicado, 0)
  const totalMetodos = pago.metodos.reduce((sum, m) => sum + m.monto, 0)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/pagos">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Header
              title={`Orden de pago - ${pago.proveedor.razonSocial}`}
              description={`Fecha: ${formatDate(pago.fecha)}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={pago.estado === 'PAGADO' ? 'PAGADA' : pago.estado} />
          </div>
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex items-center gap-2">
            {pago.estado === 'BORRADOR' && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/pagos/${id}/editar` as '/'}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
                <Button
                  variant="primary"
                  onClick={() => updateMutation.mutate('EMITIDA')}
                  disabled={updateMutation.isPending}
                >
                  Emitir orden
                </Button>
              </>
            )}
            {pago.estado === 'EMITIDA' && (
              <Button
                variant="primary"
                onClick={() => updateMutation.mutate('PAGADO')}
                disabled={updateMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                Marcar como pagada
              </Button>
            )}
            <Button variant="outline">
              <Download className="h-4 w-4 mr-1.5" />
              Exportar PDF
            </Button>
            {pago.estado === 'BORRADOR' && (
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Eliminar
              </Button>
            )}
          </div>
        )}

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Proveedor */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Proveedor</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <p className="text-lg font-semibold text-slate-900">
                  {pago.proveedor.razonSocial}
                </p>
                {pago.proveedor.cuit && (
                  <p className="text-sm text-slate-500">
                    CUIT: {pago.proveedor.cuit}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Totales */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total documentos:</span>
                  <span className="font-medium">{formatCurrency(totalDocumentos)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total métodos:</span>
                  <span className="font-medium">{formatCurrency(totalMetodos)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-medium">Total orden:</span>
                  <span className="text-lg font-semibold">{formatCurrency(pago.montoTotal)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Nota */}
        {pago.nota && (
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Nota</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-slate-600">{pago.nota}</p>
            </CardContent>
          </Card>
        )}

        {/* Documentos */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Documentos incluidos ({pago.documentos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Confianza</TableHead>
                  <TableHead className="text-right">Total doc.</TableHead>
                  <TableHead className="text-right">Aplicado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pago.documentos.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Link
                        href={`/documento/${doc.id}`}
                        className="hover:underline"
                      >
                        {doc.tipo} {doc.letra || ''} {doc.numeroCompleto || 'S/N'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {doc.fechaEmision ? formatDate(doc.fechaEmision) : '-'}
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge score={doc.confidenceScore || 0} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {doc.total ? formatCurrency(doc.total) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(doc.montoAplicado)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Métodos de pago */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Formas de pago ({pago.metodos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Método</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pago.metodos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <PaymentMethodBadge method={m.tipo} />
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {formatDate(m.fecha)}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {m.referencia || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(m.monto)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
