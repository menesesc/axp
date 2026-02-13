'use client'

import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency, formatDate, formatNumeroOrden } from '@/lib/utils'
import { CreditCard, MoreHorizontal, Eye, Edit, CheckCircle, Download, Trash2 } from 'lucide-react'
import type { PaymentMethod } from '@/components/ui/payment-method-badge'

interface PaymentMethodItem {
  id: string
  tipo: PaymentMethod
  monto: number
}

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
  metodos: PaymentMethodItem[]
  documentosCount: number
}

interface PaymentOrdersTableProps {
  orders: PaymentOrder[]
  isLoading: boolean
  onMarkPaid?: (id: string) => void
  onDelete?: (id: string) => void
  onExportPdf?: (id: string) => void
}

export function PaymentOrdersTable({
  orders,
  isLoading,
  onMarkPaid,
  onDelete,
  onExportPdf,
}: PaymentOrdersTableProps) {
  if (isLoading) {
    return (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Documentos</TableHead>
              <TableHead>Formas de pago</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="border rounded-lg">
        <EmptyState
          icon={CreditCard}
          title="Sin órdenes de pago"
          description="Crea tu primera orden de pago seleccionando documentos confirmados"
          action={
            <Button variant="primary" asChild>
              <Link href="/pagos/nueva">Crear orden de pago</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead className="w-24">Fecha</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead className="w-20">Docs</TableHead>
            <TableHead>Formas de pago</TableHead>
            <TableHead className="w-24">Estado</TableHead>
            <TableHead className="text-right w-28">Total</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="group">
              <TableCell className="text-slate-500 text-sm font-medium tabular-nums">
                <Link href={`/pagos/${order.id}`} className="block">
                  {formatNumeroOrden(order.numero)}
                </Link>
              </TableCell>
              <TableCell className="text-slate-500 text-sm">
                <Link href={`/pagos/${order.id}`} className="block">
                  {formatDate(order.fecha)}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/pagos/${order.id}`} className="block font-medium text-slate-900">
                  {order.proveedor.razonSocial}
                </Link>
              </TableCell>
              <TableCell className="text-slate-500 text-sm">
                {order.documentosCount}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {order.metodos.slice(0, 3).map((m) => (
                    <PaymentMethodBadge key={m.id} method={m.tipo} showIcon={false} />
                  ))}
                  {order.metodos.length > 3 && (
                    <span className="text-xs text-slate-500">
                      +{order.metodos.length - 3}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={order.estado === 'PAGADO' ? 'PAGADA' : order.estado} />
              </TableCell>
              <TableCell className="text-right font-medium text-slate-900 tabular-nums">
                {formatCurrency(order.montoTotal)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/pagos/${order.id}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalle
                      </Link>
                    </DropdownMenuItem>
                    {order.estado === 'BORRADOR' && (
                      <DropdownMenuItem asChild>
                        <Link href={`/pagos/${order.id}/editar` as '/'}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {order.estado === 'EMITIDA' && (
                      <DropdownMenuItem onClick={() => onMarkPaid?.(order.id)}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Marcar pagada
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onExportPdf?.(order.id)}>
                      <Download className="h-4 w-4 mr-2" />
                      Exportar PDF
                    </DropdownMenuItem>
                    {order.estado === 'BORRADOR' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => onDelete?.(order.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
