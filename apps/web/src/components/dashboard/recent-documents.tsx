'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

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

const estadoBadge = {
  PENDIENTE: 'bg-amber-100 text-amber-700',
  CONFIRMADO: 'bg-emerald-100 text-emerald-700',
  ERROR: 'bg-red-100 text-red-700',
  DUPLICADO: 'bg-gray-100 text-gray-600',
}

function DocumentSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="px-3 py-2"><div className="h-3.5 bg-gray-100 rounded w-20" /></td>
      <td className="px-3 py-2"><div className="h-3.5 bg-gray-100 rounded w-28" /></td>
      <td className="px-3 py-2"><div className="h-3.5 bg-gray-100 rounded w-32" /></td>
      <td className="px-3 py-2 text-right"><div className="h-3.5 bg-gray-100 rounded w-16 ml-auto" /></td>
      <td className="px-3 py-2"><div className="h-5 bg-gray-100 rounded w-16" /></td>
    </tr>
  )
}

export function RecentDocuments({ clienteId }: { clienteId: string }) {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['documentos-recientes', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/documentos?pageSize=10&sortBy=createdAt&sortOrder=desc')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    staleTime: 1000 * 30,
  })

  const documentos: Documento[] = data?.documentos || []

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Documentos Recientes</h3>
        <Link
          href={'/documentos' as '/'}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          Ver todos
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">Documento</th>
              <th className="px-3 py-2 text-left font-medium">Proveedor</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              [...Array(5)].map((_, i) => <DocumentSkeleton key={i} />)
            ) : documentos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-sm">
                  No hay documentos recientes
                </td>
              </tr>
            ) : (
              documentos.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => router.push(`/documento/${doc.id}`)}
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {doc.fechaEmision ? formatDate(doc.fechaEmision) : '-'}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                    {doc.tipo} {doc.letra || ''} {doc.numeroCompleto || 'S/N'}
                  </td>
                  <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">
                    {doc.proveedores?.razonSocial || <span className="text-gray-400 italic">Sin proveedor</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">
                    {doc.total ? formatCurrency(doc.total) : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${estadoBadge[doc.estadoRevision]}`}>
                      {doc.estadoRevision}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
