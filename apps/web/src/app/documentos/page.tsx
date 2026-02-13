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
  estadoRevision: 'PENDIENTE' | 'CONFIRMADO' | 'PAGADO'
  confidenceScore: number | null
  pdfFinalKey: string | null
  proveedores: {
    id: string
    razonSocial: string
  } | null
  pagoId?: string | null
  _count?: {
    documento_items: number
  }
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
  const [sinItems, setSinItems] = useState(false)
  const [conAnotaciones, setConAnotaciones] = useState(false)
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const [quickDateFilter, setQuickDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth'>('all')
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
    if (sinItems) params.append('sinItems', 'true')
    if (conAnotaciones) params.append('conAnotaciones', 'true')
    if (dateFrom) params.append('dateFrom', dateFrom.toISOString())
    if (dateTo) params.append('dateTo', dateTo.toISOString())
    return params.toString()
  }, [page, pageSize, estado, search, proveedorFilter, confidenceFilter, sinItems, conAnotaciones, dateFrom, dateTo])

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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (documentoIds: string[]) => {
      const res = await fetch('/api/documentos/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoIds }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documentos'] })
      setSelectedDocs(new Set())
      toast.success(`${data.deletedCount} documentos eliminados`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al eliminar documentos')
    },
  })

  const hasActiveFilters = !!(
    search ||
    (confidenceFilter && confidenceFilter !== 'all') ||
    (proveedorFilter && proveedorFilter !== 'all') ||
    sinItems ||
    conAnotaciones ||
    dateFrom ||
    dateTo
  )

  const handleClearFilters = () => {
    setSearch('')
    setConfidenceFilter('')
    setProveedorFilter('')
    setSinItems(false)
    setConAnotaciones(false)
    setDateFrom(undefined)
    setDateTo(undefined)
    setQuickDateFilter('all')
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

  const handleBulkDelete = () => {
    if (selectedDocs.size === 0 || !isAdmin) return
    if (!confirm(`¿Estás seguro de eliminar ${selectedDocs.size} documento${selectedDocs.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) {
      return
    }
    bulkDeleteMutation.mutate(Array.from(selectedDocs))
  }

  const handleConfirmDoc = (_docId: string) => {
    toast.info('Función de confirmación próximamente')
  }

  const documentos = data?.documentos || []
  const pagination = data?.pagination

  // Calcular si se puede crear orden de pago
  const paymentValidation = useMemo(() => {
    if (selectedDocs.size === 0) {
      return { canAdd: false, reason: 'Selecciona documentos', proveedorId: undefined }
    }

    const selectedDocsList = documentos.filter((d) => selectedDocs.has(d.id))

    // Verificar que todos tengan el mismo proveedor
    const proveedorIds = new Set(selectedDocsList.map((d) => d.proveedores?.id).filter(Boolean))
    if (proveedorIds.size === 0) {
      return { canAdd: false, reason: 'Los documentos no tienen proveedor asignado', proveedorId: undefined }
    }
    if (proveedorIds.size > 1) {
      return { canAdd: false, reason: 'Los documentos deben ser del mismo proveedor', proveedorId: undefined }
    }

    // Verificar que todos estén confirmados
    const noConfirmados = selectedDocsList.filter((d) => d.estadoRevision !== 'CONFIRMADO')
    if (noConfirmados.length > 0) {
      return { canAdd: false, reason: 'Todos los documentos deben estar confirmados', proveedorId: undefined }
    }

    const proveedorId = Array.from(proveedorIds)[0]
    return { canAdd: true, reason: undefined, proveedorId }
  }, [selectedDocs, documentos])

  const handleAddToPayment = () => {
    if (!paymentValidation.canAdd || !paymentValidation.proveedorId) return
    const selectedArray = Array.from(selectedDocs)
    sessionStorage.setItem('pendingPaymentDocs', JSON.stringify(selectedArray))
    sessionStorage.setItem('pendingPaymentProveedor', paymentValidation.proveedorId)
    router.push('/pagos/nueva')
  }

  const handleAddSingleToPayment = (docId: string) => {
    const doc = documentos.find((d) => d.id === docId)
    if (!doc?.proveedores?.id || doc.estadoRevision !== 'CONFIRMADO') {
      toast.error('El documento debe estar confirmado y tener proveedor')
      return
    }
    sessionStorage.setItem('pendingPaymentDocs', JSON.stringify([docId]))
    sessionStorage.setItem('pendingPaymentProveedor', doc.proveedores.id)
    router.push('/pagos/nueva')
  }

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
          sinItems={sinItems}
          onSinItemsChange={(v) => { setSinItems(v); setPage(1) }}
          conAnotaciones={conAnotaciones}
          onConAnotacionesChange={(v) => { setConAnotaciones(v); setPage(1) }}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={(d) => { setDateFrom(d); setPage(1) }}
          onDateToChange={(d) => { setDateTo(d); setPage(1) }}
          quickDateFilter={quickDateFilter}
          onQuickDateFilterChange={(v) => { setQuickDateFilter(v); setPage(1) }}
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
            onDelete={handleBulkDelete}
            onCancel={() => setSelectedDocs(new Set())}
            isAssigning={bulkAssignMutation.isPending}
            isDeleting={bulkDeleteMutation.isPending}
            canAddToPayment={paymentValidation.canAdd}
            {...(paymentValidation.reason ? { paymentDisabledReason: paymentValidation.reason } : {})}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
