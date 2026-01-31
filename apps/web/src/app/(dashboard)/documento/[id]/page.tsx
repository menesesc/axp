'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, FileText, Building2, Calendar, DollarSign, Package, AlertCircle, Edit, Save, X } from 'lucide-react'

// Importar el visor PDF solo en el cliente
const PDFViewer = dynamic(() => import('@/components/pdf-viewer'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando visor PDF...</p>
        </div>
      </div>
    </div>
  ),
})

interface DocumentoItem {
  id: string
  linea: number
  descripcion: string
  codigo: string | null
  cantidad: number | null
  unidad: string | null
  precioUnitario: number | null
  subtotal: number | null
}

interface Documento {
  id: string
  tipo: string
  letra: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  total: number | null
  subtotal: number | null
  iva: number | null
  estadoRevision: 'PENDIENTE' | 'CONFIRMADO' | 'ERROR' | 'DUPLICADO'
  missingFields: string[]
  pdfFinalKey: string | null
  pdfRawKey: string
  clientes: { id: string; razonSocial: string; cuit: string }
  proveedores: { id: string; razonSocial: string; cuit: string } | null
}

interface DocumentoResponse {
  documento: Documento
  items: DocumentoItem[]
}

const estadoVariants = {
  PENDIENTE: 'warning',
  CONFIRMADO: 'success',
  ERROR: 'error',
  DUPLICADO: 'default',
} as const

const fieldNames: Record<string, string> = {
  clienteId: 'Cliente',
  proveedorId: 'Proveedor',
  fechaEmision: 'Fecha de emisión',
  total: 'Total',
  letra: 'Letra',
  numeroCompleto: 'Número completo',
  subtotal: 'Subtotal',
  iva: 'IVA',
}

export default function DocumentoPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const documentoId = params.id as string
  
  // Estado para edición de campos
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<any>({})

  const { data, isLoading, error } = useQuery<DocumentoResponse>({
    queryKey: ['documento', documentoId],
    queryFn: async () => {
      const res = await fetch(`/api/documentos/${documentoId}`)
      if (!res.ok) throw new Error('Failed to fetch documento')
      return res.json()
    },
  })

  // Query para obtener la URL firmada del PDF
  const { data: pdfData } = useQuery<{ url: string }>({
    queryKey: ['pdf-url', data?.documento.pdfFinalKey || data?.documento.pdfRawKey],
    queryFn: async () => {
      const key = data?.documento.pdfFinalKey || data?.documento.pdfRawKey
      if (!key) throw new Error('No PDF key available')
      const res = await fetch(`/api/pdf?key=${encodeURIComponent(key)}`)
      if (!res.ok) throw new Error('Failed to get PDF URL')
      return res.json()
    },
    enabled: !!(data?.documento.pdfFinalKey || data?.documento.pdfRawKey),
    staleTime: 1000 * 60 * 30, // 30 minutos
  })

  // Mutation para actualizar documento
  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await fetch(`/api/documentos/${documentoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update documento')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documento', documentoId] })
      setIsEditing(false)
      setEditData({})
    },
  })

  const handleStartEdit = () => {
    if (!data?.documento) return
    setEditData({
      fechaEmision: data.documento.fechaEmision || '',
      fechaVencimiento: data.documento.fechaVencimiento || '',
      total: data.documento.total || '',
      subtotal: data.documento.subtotal || '',
      iva: data.documento.iva || '',
      letra: data.documento.letra || '',
      numeroCompleto: data.documento.numeroCompleto || '',
    })
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    updateMutation.mutate(editData)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditData({})
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando documento...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Error al cargar el documento</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-blue-600 hover:underline"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  const { documento, items } = data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {documento.tipo} {documento.letra} {documento.numeroCompleto || 'Sin número'}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {documento.proveedores?.razonSocial || 'Sin proveedor'}
                </p>
              </div>
            </div>
            <Badge variant={estadoVariants[documento.estadoRevision]}>
              {documento.estadoRevision}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Details */}
          <div className="space-y-6">
            {/* Info Card */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Información General
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Proveedor</p>
                    <p className="font-medium">
                      {documento.proveedores?.razonSocial || 'Sin asignar'}
                    </p>
                    {documento.proveedores?.cuit && (
                      <p className="text-sm text-gray-500">CUIT: {documento.proveedores.cuit}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Fecha de Emisión</p>
                      <p className="font-medium">
                        {documento.fechaEmision ? formatDate(documento.fechaEmision) : 'No disponible'}
                      </p>
                    </div>
                    {documento.fechaVencimiento && (
                      <div>
                        <p className="text-sm text-gray-500">Fecha de Vencimiento</p>
                        <p className="font-medium">{formatDate(documento.fechaVencimiento)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Totals Card */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Montos
              </h2>
              <div className="space-y-3">
                {documento.subtotal !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">{formatCurrency(documento.subtotal)}</span>
                  </div>
                )}
                {documento.iva !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">IVA</span>
                    <span className="font-medium">{formatCurrency(documento.iva)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="text-lg font-semibold">Total</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {documento.total ? formatCurrency(documento.total) : 'No disponible'}
                  </span>
                </div>
              </div>
            </div>

            {/* Missing Fields Warning / Edit Form */}
            {documento.missingFields && documento.missingFields.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-amber-900">Campos faltantes</h3>
                      {!isEditing && (
                        <p className="text-sm text-amber-700 mt-1">
                          Este documento requiere completar algunos campos
                        </p>
                      )}
                    </div>
                  </div>
                  {!isEditing ? (
                    <button
                      onClick={handleStartEdit}
                      className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm"
                    >
                      <Edit className="h-4 w-4" />
                      Completar
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={updateMutation.isPending}
                        className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Guardar
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {documento.missingFields.includes('fechaEmision') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Fecha de Emisión
                        </label>
                        <input
                          type="date"
                          value={editData.fechaEmision}
                          onChange={(e) => setEditData({ ...editData, fechaEmision: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('fechaVencimiento') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Fecha de Vencimiento
                        </label>
                        <input
                          type="date"
                          value={editData.fechaVencimiento}
                          onChange={(e) => setEditData({ ...editData, fechaVencimiento: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('letra') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Letra
                        </label>
                        <select
                          value={editData.letra}
                          onChange={(e) => setEditData({ ...editData, letra: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </div>
                    )}
                    {documento.missingFields.includes('numeroCompleto') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Número Completo
                        </label>
                        <input
                          type="text"
                          value={editData.numeroCompleto}
                          onChange={(e) => setEditData({ ...editData, numeroCompleto: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="000100000001"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('total') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Total
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editData.total}
                          onChange={(e) => setEditData({ ...editData, total: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="0.00"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('subtotal') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Subtotal
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editData.subtotal}
                          onChange={(e) => setEditData({ ...editData, subtotal: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="0.00"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('iva') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          IVA
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editData.iva}
                          onChange={(e) => setEditData({ ...editData, iva: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {documento.missingFields.map((field) => (
                      <li key={field} className="text-sm text-amber-700">
                        • {fieldNames[field] || field}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Items Table */}
            {items.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Items ({items.length})
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">#</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Descripción</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Cant.</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">P. Unit.</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{item.linea}</td>
                          <td className="px-4 py-3 text-sm">
                            <div>
                              <p className="font-medium">{item.descripcion}</p>
                              {item.codigo && (
                                <p className="text-xs text-gray-500">Código: {item.codigo}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {item.cantidad ? `${item.cantidad} ${item.unidad || ''}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {item.precioUnitario ? formatCurrency(item.precioUnitario) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium">
                            {item.subtotal ? formatCurrency(item.subtotal) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - PDF Viewer */}
          <div className="lg:sticky lg:top-24 h-fit">
            {pdfData?.url ? (
              <PDFViewer url={pdfData.url} />
            ) : (
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className="flex items-center justify-center h-96">
                  <p className="text-gray-500">
                    {data?.documento.pdfFinalKey || data?.documento.pdfRawKey 
                      ? 'Cargando PDF...' 
                      : 'PDF no disponible'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
