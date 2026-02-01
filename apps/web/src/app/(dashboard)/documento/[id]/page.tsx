'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  Building2,
  Calendar,
  AlertCircle,
  Edit,
  Save,
  X,
  ExternalLink,
  Copy,
  CheckCircle2,
} from 'lucide-react'
import { useUser } from '@/hooks/use-user'

const PDFViewer = dynamic(() => import('@/components/pdf-viewer'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg border border-gray-200 h-[500px] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-2 text-sm text-gray-500">Cargando PDF...</p>
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

const estadoBadge = {
  PENDIENTE: 'bg-amber-100 text-amber-700',
  CONFIRMADO: 'bg-emerald-100 text-emerald-700',
  ERROR: 'bg-red-100 text-red-700',
  DUPLICADO: 'bg-gray-100 text-gray-600',
}

const fieldNames: Record<string, string> = {
  clienteId: 'Cliente',
  proveedorId: 'Proveedor',
  fechaEmision: 'Fecha',
  total: 'Total',
  letra: 'Letra',
  numeroCompleto: 'Número',
  subtotal: 'Subtotal',
  iva: 'IVA',
}

export default function DocumentoPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAdmin } = useUser()
  const documentoId = params.id as string

  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<any>({})
  const [copied, setCopied] = useState(false)

  const { data, isLoading, error } = useQuery<{ documento: Documento; items: DocumentoItem[] }>({
    queryKey: ['documento', documentoId],
    queryFn: async () => {
      const res = await fetch(`/api/documentos/${documentoId}`)
      if (!res.ok) throw new Error('Failed to fetch documento')
      return res.json()
    },
    staleTime: 1000 * 60 * 5,
  })

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
    staleTime: 1000 * 60 * 30,
  })

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await fetch(`/api/documentos/${documentoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documento', documentoId] })
      queryClient.invalidateQueries({ queryKey: ['documentos'] })
      setIsEditing(false)
      setEditData({})
    },
  })

  const handleStartEdit = () => {
    if (!data?.documento || !isAdmin) return
    setEditData({
      fechaEmision: data.documento.fechaEmision?.split('T')[0] || '',
      fechaVencimiento: data.documento.fechaVencimiento?.split('T')[0] || '',
      total: data.documento.total || '',
      subtotal: data.documento.subtotal || '',
      iva: data.documento.iva || '',
      letra: data.documento.letra || '',
      numeroCompleto: data.documento.numeroCompleto || '',
    })
    setIsEditing(true)
  }

  const handleCopyNumber = () => {
    if (data?.documento.numeroCompleto) {
      navigator.clipboard.writeText(data.documento.numeroCompleto)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-64" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border p-4 space-y-3">
                <div className="h-4 bg-gray-100 rounded w-32" />
                <div className="h-6 bg-gray-200 rounded w-48" />
              </div>
              <div className="bg-white rounded-lg border h-[400px]" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
          <p className="text-gray-600 text-sm">Error al cargar el documento</p>
          <button onClick={() => router.back()} className="mt-3 text-sm text-blue-600 hover:underline">
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
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold text-gray-900">
                    {documento.tipo} {documento.letra} {documento.numeroCompleto || 'S/N'}
                  </h1>
                  {documento.numeroCompleto && (
                    <button onClick={handleCopyNumber} className="p-1 hover:bg-gray-100 rounded" title="Copiar">
                      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">{documento.proveedores?.razonSocial || 'Sin proveedor'}</p>
              </div>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${estadoBadge[documento.estadoRevision]}`}>
              {documento.estadoRevision}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left - Details */}
          <div className="space-y-4">
            {/* Info Card */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Proveedor</p>
                    <p className="font-medium text-gray-900">{documento.proveedores?.razonSocial || 'Sin asignar'}</p>
                    {documento.proveedores?.cuit && <p className="text-xs text-gray-500">CUIT: {documento.proveedores.cuit}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Fecha Emisión</p>
                    <p className="font-medium text-gray-900">{documento.fechaEmision ? formatDate(documento.fechaEmision) : '-'}</p>
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                {documento.subtotal !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">{formatCurrency(documento.subtotal)}</span>
                  </div>
                )}
                {documento.iva !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">IVA</span>
                    <span className="font-medium">{formatCurrency(documento.iva)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold text-blue-600">{documento.total ? formatCurrency(documento.total) : '-'}</span>
                </div>
              </div>
            </div>

            {/* Missing Fields */}
            {documento.missingFields && documento.missingFields.length > 0 && isAdmin && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">Campos faltantes</p>
                      {!isEditing && (
                        <p className="text-xs text-amber-700 mt-0.5">
                          {documento.missingFields.map(f => fieldNames[f] || f).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  {!isEditing ? (
                    <button
                      onClick={handleStartEdit}
                      className="flex items-center gap-1 px-2 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700"
                    >
                      <Edit className="w-3 h-3" />
                      Editar
                    </button>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        onClick={() => updateMutation.mutate(editData)}
                        disabled={updateMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Save className="w-3 h-3" />
                        Guardar
                      </button>
                      <button
                        onClick={() => { setIsEditing(false); setEditData({}) }}
                        className="flex items-center gap-1 px-2 py-1 bg-gray-500 text-white rounded text-xs font-medium hover:bg-gray-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {documento.missingFields.includes('fechaEmision') && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
                        <input
                          type="date"
                          value={editData.fechaEmision}
                          onChange={(e) => setEditData({ ...editData, fechaEmision: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('letra') && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Letra</label>
                        <select
                          value={editData.letra}
                          onChange={(e) => setEditData({ ...editData, letra: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="">-</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </div>
                    )}
                    {documento.missingFields.includes('numeroCompleto') && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
                        <input
                          type="text"
                          value={editData.numeroCompleto}
                          onChange={(e) => setEditData({ ...editData, numeroCompleto: e.target.value })}
                          placeholder="0001-00000001"
                          className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('total') && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Total</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editData.total}
                          onChange={(e) => setEditData({ ...editData, total: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('subtotal') && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Subtotal</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editData.subtotal}
                          onChange={(e) => setEditData({ ...editData, subtotal: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    )}
                    {documento.missingFields.includes('iva') && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">IVA</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editData.iva}
                          onChange={(e) => setEditData({ ...editData, iva: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Items */}
            {items.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase">Items ({items.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">P.Unit.</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500">{item.linea}</td>
                          <td className="px-3 py-2">
                            <p className="text-gray-900">{item.descripcion}</p>
                            {item.codigo && <p className="text-xs text-gray-400">{item.codigo}</p>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.cantidad ? `${item.cantidad} ${item.unidad || ''}` : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.precioUnitario ? formatCurrency(item.precioUnitario) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
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

          {/* Right - PDF */}
          <div className="lg:sticky lg:top-16 h-fit space-y-2">
            {pdfData?.url ? (
              <>
                <PDFViewer url={pdfData.url} />
                <a
                  href={pdfData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir PDF
                </a>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 h-[400px] flex items-center justify-center">
                <p className="text-sm text-gray-400">PDF no disponible</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
