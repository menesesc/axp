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
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import { ConfidenceBadge } from '@/components/ui/confidence-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, MoreHorizontal, Eye, CheckCircle, Download, CreditCard, FileIcon, Loader2, Banknote } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface Document {
  id: string
  tipo: string
  letra: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  total: number | null
  estadoRevision: 'PENDIENTE' | 'CONFIRMADO' | 'PAGADO'
  confidenceScore: number | null
  pdfFinalKey: string | null
  pagoId?: string | null
  proveedores: {
    id: string
    razonSocial: string
  } | null
  _count?: {
    documento_items: number
  }
}

function PdfButton({ pdfKey }: { pdfKey: string | null }) {
  const [isLoading, setIsLoading] = useState(false)

  const openPdf = async () => {
    if (!pdfKey) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/pdf?key=${encodeURIComponent(pdfKey)}`)
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      window.open(data.url, '_blank')
    } catch {
      toast.error('Error al abrir el PDF')
    } finally {
      setIsLoading(false)
    }
  }

  if (!pdfKey) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled
        title="PDF no disponible"
      >
        <FileIcon className="h-4 w-4 text-slate-300" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={openPdf}
      disabled={isLoading}
      title="Ver PDF"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      ) : (
        <FileIcon className="h-4 w-4 text-blue-600" />
      )}
    </Button>
  )
}

interface DocumentsTableProps {
  documents: Document[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectionChange: (id: string) => void
  onSelectAll: () => void
  isAdmin: boolean
  onConfirm?: (id: string) => void
  onAddToPayment?: (id: string) => void
}

export function DocumentsTable({
  documents,
  isLoading,
  selectedIds,
  onSelectionChange,
  onSelectAll,
  isAdmin,
  onConfirm,
  onAddToPayment,
}: DocumentsTableProps) {
  const allSelected = documents.length > 0 && selectedIds.size === documents.length

  if (isLoading) {
    return (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead className="w-10" />}
              <TableHead>Fecha</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Confianza</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>PDF</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(10)].map((_, i) => (
              <TableRow key={i}>
                {isAdmin && (
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                )}
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="border rounded-lg">
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description="No se encontraron documentos con los filtros aplicados"
        />
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            {isAdmin && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
            )}
            <TableHead className="w-24">Fecha</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead className="w-24">Estado</TableHead>
            <TableHead className="w-28">Confianza</TableHead>
            <TableHead className="w-16 text-center">Items</TableHead>
            <TableHead className="text-right w-28">Total</TableHead>
            <TableHead className="w-10">PDF</TableHead>
            <TableHead className="w-10">Pago</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow
              key={doc.id}
              className="group cursor-pointer"
              data-state={selectedIds.has(doc.id) ? 'selected' : undefined}
            >
              {isAdmin && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(doc.id)}
                    onCheckedChange={() => onSelectionChange(doc.id)}
                  />
                </TableCell>
              )}
              <TableCell className="text-slate-500 text-sm">
                <Link href={`/documento/${doc.id}`} className="block">
                  {doc.fechaEmision ? formatDate(doc.fechaEmision) : '-'}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/documento/${doc.id}`} className="block">
                  <span className="font-medium text-slate-900">
                    {doc.tipo} {doc.letra || ''}
                  </span>
                  <span className="text-slate-500 ml-1">
                    {doc.numeroCompleto || 'S/N'}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/documento/${doc.id}`} className="block text-slate-600 truncate max-w-[200px]">
                  {doc.proveedores?.razonSocial || 'Sin proveedor'}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/documento/${doc.id}`} className="block">
                  <StatusBadge status={doc.estadoRevision} />
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/documento/${doc.id}`} className="block">
                  <ConfidenceBadge score={doc.confidenceScore || 0} />
                </Link>
              </TableCell>
              <TableCell className="text-center">
                <Link href={`/documento/${doc.id}`} className="block text-slate-500 text-sm tabular-nums">
                  {doc._count?.documento_items ?? '-'}
                </Link>
              </TableCell>
              <TableCell className="text-right">
                <Link href={`/documento/${doc.id}`} className="block font-medium text-slate-900 tabular-nums">
                  {doc.total ? formatCurrency(doc.total) : '-'}
                </Link>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <PdfButton pdfKey={doc.pdfFinalKey} />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                {doc.pagoId ? (
                  <Link href={`/pagos/${doc.pagoId}`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Ver orden de pago"
                    >
                      <Banknote className="h-4 w-4 text-green-600" />
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled
                    title="Sin orden de pago"
                  >
                    <Banknote className="h-4 w-4 text-slate-300" />
                  </Button>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
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
                      <Link href={`/documento/${doc.id}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalle
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && doc.estadoRevision === 'PENDIENTE' && (
                      <DropdownMenuItem onClick={() => onConfirm?.(doc.id)}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Confirmar
                      </DropdownMenuItem>
                    )}
                    {isAdmin && doc.estadoRevision === 'CONFIRMADO' && (
                      <DropdownMenuItem onClick={() => onAddToPayment?.(doc.id)}>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Agregar a pago
                      </DropdownMenuItem>
                    )}
                    {doc.pagoId && (
                      <DropdownMenuItem asChild>
                        <Link href={`/pagos/${doc.pagoId}`}>
                          <Banknote className="h-4 w-4 mr-2" />
                          Ver orden de pago
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem>
                      <Download className="h-4 w-4 mr-2" />
                      Exportar PDF
                    </DropdownMenuItem>
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
