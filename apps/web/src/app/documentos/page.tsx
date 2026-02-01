'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { DocumentFilters } from '@/components/documents/document-filters'
import { DocumentsTable } from '@/components/documents/documents-table'
import { BulkActionsBar } from '@/components/documents/bulk-actions-bar'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/use-user'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Documento {
  id: string
  tipo: string
  letra: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  total: number | null
  estadoRevision: 'PENDIENTE' | 'CONFIRMADO'
  confidenceScore: number | null
  proveedores: {
    id: string
    razonSocial: string
  } | null
}

interface DocumentosResponse {
  documentos: Documento[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export default function DocumentosPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { clienteId, isAdmin } = useUser()

  // Filters state
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('')
  const [confidenceFilter, setConfidenceFilter] = useState('')
  const [proveedorFilter, setProveedorFilter] = useState('')
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const [page, setPage] = useState(1)
  const pageSize = 25

  // Selection state
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [selectedProveedor, setSelectedProveedor] = useState('')

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    })
    if (estado) params.append('estado', estado)
    if (search) params.append('q', search)
    if (proveedorFilter && proveedorFilter !== 'all') {
      params.append('proveedorId', proveedorFilter === 'none' ? 'null' : proveedorFilter)
    }
    if (confidenceFilter && confidenceFilter !== 'all') {
      params.append('confidence', confidenceFilter)
    }
    if (dateFrom) params.append('dateFrom', dateFrom.toISOString())
    if (dateTo) params.append('dateTo', dateTo.toISOString())
    return params.toString()
  }, [page, pageSize, estado, search, proveedorFilter, confidenceFilter, dateFrom, dateTo])

  const { data, isLoading } = useQuery<DocumentosResponse>({
    queryKey: ['documentos', clienteId, queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/documentos?${queryParams}`)
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
    staleTime: 1000 * 30,
    enabled: !!clienteId,
  })

  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Failed to fetch proveedores')
      return res.json()
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!clienteId,
  })

  const proveedores = useMemo(() => {
    return (proveedoresData?.proveedores?.filter((p: { activo: boolean }) => p.activo) || [])
      .sort((a: { razonSocial: string }, b: { razonSocial: string }) =>
        a.razonSocial.localeCompare(b.razonSocial)
      )
  }, [proveedoresData])

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ documentoIds, proveedorId }: { documentoIds: string[]; proveedorId: string | null }) => {
      const res = await fetch('/api/documentos/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoIds, proveedorId }),
      })
      if (!res.ok) throw new Error('Failed to bulk assign')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documentos'] })
      setSelectedDocs(new Set())
      setSelectedProveedor('')
      toast.success(`${data.updatedCount} documentos actualizados`)
    },
    onError: () => {
      toast.error('Error al asignar proveedor')
    },
  })

  const hasActiveFilters = !!(
    search ||
    (confidenceFilter && confidenceFilter !== 'all') ||
    (proveedorFilter && proveedorFilter !== 'all') ||
    dateFrom ||
    dateTo
  )

  const handleClearFilters = () => {
    setSearch('')
    setConfidenceFilter('')
    setProveedorFilter('')
    setDateFrom(undefined)
    setDateTo(undefined)
    setPage(1)
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleEstadoChange = (value: string) => {
    setEstado(value)
    setPage(1)
    setSelectedDocs(new Set())
  }

  const toggleDocSelection = (docId: string) => {
    if (!isAdmin) return
    const newSelection = new Set(selectedDocs)
    if (newSelection.has(docId)) {
      newSelection.delete(docId)
    } else {
      newSelection.add(docId)
    }
    setSelectedDocs(newSelection)
  }

  const toggleAllDocs = () => {
    if (!isAdmin) return
    const docs = data?.documentos || []
    if (selectedDocs.size === docs.length && docs.length > 0) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(docs.map(d => d.id)))
    }
  }

  const handleBulkAssign = () => {
    if (selectedDocs.size === 0 || !isAdmin || !selectedProveedor) return
    if (selectedProveedor === '__nuevo__') {
      sessionStorage.setItem('pendingDocumentAssignment', JSON.stringify(Array.from(selectedDocs)))
      router.push('/proveedores')
      return
    }
    bulkAssignMutation.mutate({
      documentoIds: Array.from(selectedDocs),
      proveedorId: selectedProveedor === 'null' ? null : selectedProveedor,
    })
  }

  const handleAddToPayment = () => {
    const selectedArray = Array.from(selectedDocs)
    sessionStorage.setItem('pendingPaymentDocs', JSON.stringify(selectedArray))
    router.push('/pagos/nueva')
  }

  const handleConfirmDoc = (_docId: string) => {
    toast.info('Función de confirmación próximamente')
  }

  const handleAddSingleToPayment = (docId: string) => {
    sessionStorage.setItem('pendingPaymentDocs', JSON.stringify([docId]))
    router.push('/pagos/nueva')
  }

  const documentos = data?.documentos || []
  const pagination = data?.pagination

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">No tienes acceso</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Header
          title="Documentos"
          description={pagination ? `${pagination.total} documentos en total` : undefined}
        />

        <DocumentFilters
          search={search}
          onSearchChange={handleSearchChange}
          estado={estado}
          onEstadoChange={handleEstadoChange}
          confidenceFilter={confidenceFilter}
          onConfidenceFilterChange={(v) => { setConfidenceFilter(v); setPage(1) }}
          proveedorId={proveedorFilter}
          onProveedorChange={(v) => { setProveedorFilter(v); setPage(1) }}
          proveedores={proveedores}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={(d) => { setDateFrom(d); setPage(1) }}
          onDateToChange={(d) => { setDateTo(d); setPage(1) }}
          onClearFilters={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        <DocumentsTable
          documents={documentos}
          isLoading={isLoading}
          selectedIds={selectedDocs}
          onSelectionChange={toggleDocSelection}
          onSelectAll={toggleAllDocs}
          isAdmin={isAdmin}
          onConfirm={handleConfirmDoc}
          onAddToPayment={handleAddSingleToPayment}
        />

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Mostrando {((pagination.page - 1) * pageSize) + 1} a{' '}
              {Math.min(pagination.page * pageSize, pagination.total)} de{' '}
              {pagination.total} resultados
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
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
                onClick={() => setPage(p => p + 1)}
                disabled={page >= pagination.pages}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Bulk Actions Bar */}
        {isAdmin && (
          <BulkActionsBar
            selectedCount={selectedDocs.size}
            proveedores={proveedores}
            selectedProveedor={selectedProveedor}
            onProveedorChange={setSelectedProveedor}
            onAssign={handleBulkAssign}
            onAddToPayment={handleAddToPayment}
            onCancel={() => setSelectedDocs(new Set())}
            isAssigning={bulkAssignMutation.isPending}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
