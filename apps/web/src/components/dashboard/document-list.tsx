'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  X,
  Sparkles,
  Search,
  Filter,
  Lock,
} from 'lucide-react'
import { useRealtimeDocumentos } from '@/hooks/use-realtime-documentos'
import { useDocumentNotifications } from '@/hooks/use-document-notifications'
import { useUser } from '@/hooks/use-user'

interface Documento {
  id: string
  tipo: string
  letra: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  total: number | null
  estadoRevision: 'PENDIENTE' | 'CONFIRMADO' | 'ERROR' | 'DUPLICADO'
  proveedores: {
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

const estadoVariants = {
  PENDIENTE: 'warning',
  CONFIRMADO: 'success',
  ERROR: 'error',
  DUPLICADO: 'outline',
} as const

export function DocumentList({ clienteId }: { clienteId: string }) {
  const router = useRouter()
  const { isAdmin } = useUser()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [selectedProveedor, setSelectedProveedor] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('')

  const queryClient = useQueryClient()

  // Activar actualizaciones en tiempo real
  useRealtimeDocumentos(clienteId)

  // Sistema de notificaciones para documentos nuevos
  const { isNew, clearAll } = useDocumentNotifications(clienteId)

  // Limpiar notificaciones cuando se recarga la página
  useEffect(() => {
    const handleBeforeUnload = () => {
      clearAll()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [clearAll])

  // Query de proveedores para el selector
  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Failed to fetch proveedores')
      return res.json()
    },
  })

  const { data, isLoading } = useQuery<DocumentosResponse>({
    queryKey: ['documentos', clienteId, page, pageSize, estadoFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (estadoFilter) params.append('estado', estadoFilter)
      if (searchQuery) params.append('q', searchQuery)

      const res = await fetch(`/api/documentos?${params}`)
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
  })

  // Filtrar proveedores activos y ordenar por razón social
  const proveedores = (
    proveedoresData?.proveedores?.filter((p: any) => p.activo) || []
  ).sort((a: any, b: any) => a.razonSocial.localeCompare(b.razonSocial))

  // Mutation para asignación masiva
  const bulkAssignMutation = useMutation({
    mutationFn: async ({
      documentoIds,
      proveedorId,
    }: {
      documentoIds: string[]
      proveedorId: string | null
    }) => {
      const res = await fetch('/api/documentos/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoIds, proveedorId }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to bulk assign')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentos'] })
      setSelectedDocs(new Set())
      setSelectedProveedor('')
    },
  })

  const handleBulkAssign = () => {
    if (selectedDocs.size === 0 || !isAdmin) return

    // Si seleccionó "Nuevo", redirigir a la página de proveedores
    if (selectedProveedor === '__nuevo__') {
      sessionStorage.setItem(
        'pendingDocumentAssignment',
        JSON.stringify(Array.from(selectedDocs))
      )
      router.push('/proveedores')
      return
    }

    bulkAssignMutation.mutate({
      documentoIds: Array.from(selectedDocs),
      proveedorId: selectedProveedor || null,
    })
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
    if (selectedDocs.size === docs.length) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(docs.map((d: Documento) => d.id)))
    }
  }

  const columns: ColumnDef<Documento>[] = [
    ...(isAdmin
      ? [
          {
            id: 'select',
            header: () => {
              const docs = data?.documentos || []
              return (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedDocs.size === docs.length && docs.length > 0}
                    onChange={toggleAllDocs}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              )
            },
            cell: ({ row }: any) => (
              <div
                className="flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedDocs.has(row.original.id)}
                  onChange={() => toggleDocSelection(row.original.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
            ),
            size: 40,
          } as ColumnDef<Documento>,
        ]
      : []),
    {
      accessorKey: 'fechaEmision',
      header: ({ column }) => {
        return (
          <button
            className="flex items-center gap-1 hover:text-gray-900"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Fecha
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
          </button>
        )
      },
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.fechaEmision
            ? formatDate(row.original.fechaEmision)
            : '-'}
        </div>
      ),
      size: 100,
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => (
        <div className="font-medium text-sm">
          {row.original.tipo}
          {row.original.letra && (
            <span className="ml-1">{row.original.letra}</span>
          )}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'numeroCompleto',
      header: 'N° Documento',
      cell: ({ row }) => (
        <div className="font-medium text-sm">
          {row.original.numeroCompleto || (
            <span className="text-gray-400">Sin número</span>
          )}
        </div>
      ),
      size: 130,
    },
    {
      accessorKey: 'proveedores.razonSocial',
      header: 'Proveedor',
      cell: ({ row }) => (
        <div className="max-w-xs truncate text-sm">
          {row.original.proveedores?.razonSocial || (
            <span className="text-gray-400">Sin proveedor</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'total',
      header: ({ column }) => {
        return (
          <button
            className="flex items-center gap-1 hover:text-gray-900 ml-auto"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Total
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
          </button>
        )
      },
      cell: ({ row }) => (
        <div className="font-semibold text-right text-sm">
          {row.original.total ? formatCurrency(row.original.total) : '-'}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: 'estadoRevision',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge variant={estadoVariants[row.original.estadoRevision]}>
          {row.original.estadoRevision}
        </Badge>
      ),
      size: 110,
    },
  ]

  const table = useReactTable({
    data: data?.documentos || [],
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: data ? data.pagination.pages : 0,
  })

  if (isLoading) {
    return (
      <div className="border rounded-lg p-8 text-center bg-white">
        <div className="animate-pulse">Cargando documentos...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por número o proveedor..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={estadoFilter}
            onChange={(e) => {
              setEstadoFilter(e.target.value)
              setPage(1)
            }}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="CONFIRMADO">Confirmado</option>
            <option value="ERROR">Error</option>
            <option value="DUPLICADO">Duplicado</option>
          </select>
        </div>
      </div>

      {/* Mensaje para usuarios VIEWER */}
      {!isAdmin && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          <Lock className="h-4 w-4" />
          <span>Modo solo lectura. Contacta al administrador para editar documentos.</span>
        </div>
      )}

      {/* Barra de acciones masivas (solo ADMIN) */}
      {isAdmin && selectedDocs.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white rounded-lg shadow-xl p-4 flex items-center gap-4 min-w-[500px]">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5" />
            <span className="font-medium">
              {selectedDocs.size} documento{selectedDocs.size !== 1 ? 's' : ''}{' '}
              seleccionado{selectedDocs.size !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex-1 flex items-center gap-2">
            <select
              value={selectedProveedor}
              onChange={(e) => setSelectedProveedor(e.target.value)}
              className="flex-1 rounded-md border-gray-300 bg-white text-gray-900 text-sm px-3 py-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar proveedor...</option>
              <option value="__nuevo__">+ Crear nuevo</option>
              <option value="null">Sin proveedor</option>
              {proveedores.length > 0 ? (
                proveedores.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.razonSocial}
                  </option>
                ))
              ) : (
                <option disabled>Cargando proveedores...</option>
              )}
            </select>

            <button
              onClick={handleBulkAssign}
              disabled={bulkAssignMutation.isPending}
              className="px-4 py-2 bg-white text-blue-600 rounded-md font-medium hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkAssignMutation.isPending ? 'Asignando...' : 'Asignar'}
            </button>
          </div>

          <button
            onClick={() => setSelectedDocs(new Set())}
            className="text-white hover:text-blue-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {!data?.documentos.length ? (
        <div className="border rounded-lg p-8 text-center text-gray-500 bg-white">
          {searchQuery || estadoFilter
            ? 'No se encontraron documentos con los filtros aplicados'
            : 'No hay documentos para mostrar'}
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden bg-white">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y">
                {table.getRowModel().rows.map((row) => {
                  const isNewDoc = isNew(row.original.id)
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-blue-50 cursor-pointer transition-colors ${
                        isNewDoc ? 'bg-green-50 border-l-4 border-green-500' : ''
                      }`}
                      onDoubleClick={() =>
                        router.push(`/documento/${row.original.id}`)
                      }
                      title="Doble clic para ver detalles"
                    >
                      {row.getVisibleCells().map((cell, idx) => (
                        <td key={cell.id} className="px-4 py-3 text-sm relative">
                          {idx === 0 && isNewDoc && (
                            <span className="absolute left-1 top-1/2 -translate-y-1/2">
                              <Sparkles className="h-4 w-4 text-green-600 animate-pulse" />
                            </span>
                          )}
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Mostrando {data.documentos.length} de {data.pagination.total}{' '}
              documentos
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Anterior
              </button>
              <div className="px-4 py-2 text-sm border rounded-md bg-gray-50">
                Página {page} de {data.pagination.pages}
              </div>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.pagination.pages}
                className="px-4 py-2 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
