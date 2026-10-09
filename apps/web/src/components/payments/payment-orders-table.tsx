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
import { Inicial } from '@/components/dashboard/graficos'
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
      <div className="ax-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Orden</TableHead>
              <TableHead className="w-24">Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="w-16 text-center">Docs</TableHead>
              <TableHead>Formas de pago</TableHead>
              <TableHead className="w-24">Estado</TableHead>
              <TableHead className="text-right w-32">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
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
      <div className="ax-card overflow-hidden">
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
    <div className="ax-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Proveedor</TableHead>
            <TableHead className="w-28">Fecha</TableHead>
            <TableHead>Forma de pago</TableHead>
            <TableHead className="w-28">Estado</TableHead>
            <TableHead className="w-36 text-right">Total</TableHead>
            <TableHead className="w-12 pr-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="group">
              <TableCell className="py-3 pl-5">
                <Link href={`/pagos/${order.id}`} className="flex items-center gap-3">
                  <Inicial nombre={order.proveedor.razonSocial} />
                  <span className="min-w-0">
                    <span className="block max-w-[28ch] truncate font-medium text-slate-900 group-hover:text-[#1667c7]">{capitalizar(order.proveedor.razonSocial)}</span>
                    <span className="block text-xs text-slate-500">
                      OP {formatNumeroOrden(order.numero)} · {order.documentosCount} {order.documentosCount === 1 ? 'factura' : 'facturas'}
                    </span>
                  </span>
                </Link>
              </TableCell>
              <TableCell className="tabular-nums text-sm text-slate-500">{formatDate(order.fecha)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {order.metodos.slice(0, 3).map((m) => (
                    <PaymentMethodBadge key={m.id} method={m.tipo} showIcon={false} />
                  ))}
                  {order.metodos.length > 3 && (
                    <span className="inline-flex items-center rounded-full bg-slate-900/[0.05] px-2 py-0.5 text-xs text-slate-500">+{order.metodos.length - 3}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={order.estado === 'PAGADO' ? 'PAGADA' : order.estado} />
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-slate-900">{formatCurrency(order.montoTotal)}</TableCell>
              <TableCell className="pr-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900" aria-label={`Acciones de la OP ${formatNumeroOrden(order.numero)}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/pagos/${order.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        Ver detalle
                      </Link>
                    </DropdownMenuItem>
                    {order.estado === 'BORRADOR' && (
                      <DropdownMenuItem asChild>
                        <Link href={`/pagos/${order.id}/editar` as '/'}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {order.estado === 'EMITIDA' && (
                      <DropdownMenuItem onClick={() => onMarkPaid?.(order.id)}>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Marcar pagada
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onExportPdf?.(order.id)}>
                      <Download className="mr-2 h-4 w-4" />
                      Descargar PDF
                    </DropdownMenuItem>
                    {order.estado === 'BORRADOR' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => onDelete?.(order.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
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

const capitalizar = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
