'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/use-user'
import { formatCurrency } from '@/lib/utils'
import { MessageSquareWarning, FileText, AlertTriangle } from 'lucide-react'

interface Anotacion {
  id: string
  texto: string
  createdAt: string
  usuario: string
  documento: {
    id: string
    tipo: string
    letra: string | null
    numeroCompleto: string | null
    fechaEmision: string | null
    total: number | null
    proveedor: string | null
  }
}

interface AnotacionesResponse {
  anotaciones: Anotacion[]
  total: number
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const datePart = dateStr.split('T')[0] || dateStr
  const parts = datePart.split('-')
  if (parts.length < 3) return '--'
  return `${parts[2]}/${parts[1]}/${parts[0]?.slice(2)}`
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AnotacionesPage() {
  const { clienteId } = useUser()

  const { data, isLoading } = useQuery<AnotacionesResponse>({
    queryKey: ['anotaciones'],
    queryFn: async () => {
      const res = await fetch('/api/anotaciones')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

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
          title="Anotaciones"
          description="Notas y observaciones sobre documentos"
        />

        {/* Stats */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Documentos con anotaciones</p>
              <p className="text-2xl font-semibold">
                {isLoading ? <Skeleton className="h-7 w-12" /> : data?.total || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Lista de anotaciones */}
        <div className="bg-white border rounded-lg">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : !data?.anotaciones.length ? (
            <div className="p-12 text-center">
              <MessageSquareWarning className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No hay anotaciones</p>
              <p className="text-sm text-slate-400 mt-1">
                Las anotaciones aparecerán aquí cuando las agregues a un documento
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {data.anotaciones.map((anotacion) => (
                <div key={anotacion.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-50 flex-shrink-0">
                      <MessageSquareWarning className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">{anotacion.texto}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{formatDateTime(anotacion.createdAt)}</span>
                        <span>por {anotacion.usuario}</span>
                      </div>
                    </div>
                    <Link
                      href={`/documento/${anotacion.documento.id}`}
                      className="flex-shrink-0"
                    >
                      <div className="bg-slate-50 border rounded-lg p-3 hover:bg-slate-100 transition-colors min-w-[200px]">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                          <FileText className="h-4 w-4 text-slate-400" />
                          {anotacion.documento.tipo} {anotacion.documento.letra || ''}{' '}
                          {anotacion.documento.numeroCompleto?.slice(-8) || 'S/N'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 truncate">
                          {anotacion.documento.proveedor || 'Sin proveedor'}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="text-slate-400">
                            {formatShortDate(anotacion.documento.fechaEmision)}
                          </span>
                          <span className="font-medium text-slate-700">
                            {anotacion.documento.total
                              ? formatCurrency(anotacion.documento.total)
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
