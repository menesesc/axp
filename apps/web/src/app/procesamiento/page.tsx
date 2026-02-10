'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/use-user'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  FileText,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { toast } from 'sonner'

interface ProcessingLog {
  id: string
  cliente_id: string
  level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  source: 'OCR' | 'PROCESSOR' | 'WATCHER' | 'SYSTEM'
  message: string
  details: Record<string, any>
  documento_id: string | null
  filename: string | null
  read: boolean
  created_at: string
}

interface LogsResponse {
  logs: ProcessingLog[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
  unreadCount: number
}

interface LogStatsResponse {
  totalUnread: number
  last24h: {
    errors: number
    warnings: number
    success: number
  }
  last7d: {
    INFO: number
    WARNING: number
    ERROR: number
    SUCCESS: number
  }
  recentErrors: Array<{
    id: string
    message: string
    source: string
    filename: string | null
    created_at: string
    read: boolean
  }>
}

const levelConfig = {
  SUCCESS: {
    icon: CheckCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-700',
  },
  ERROR: {
    icon: AlertCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
  },
  WARNING: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
  },
  INFO: {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
  },
}

const sourceLabels = {
  OCR: 'OCR (Textract)',
  PROCESSOR: 'Procesador',
  WATCHER: 'Monitor',
  SYSTEM: 'Sistema',
}

export default function ProcesamientoPage() {
  const { clienteId } = useUser()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const pageSize = 25

  const { data: stats, isLoading: statsLoading } = useQuery<LogStatsResponse>({
    queryKey: ['logStats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/logs/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 30000,
  })

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: pageSize.toString(),
  })
  if (levelFilter !== 'all') queryParams.set('level', levelFilter)
  if (sourceFilter !== 'all') queryParams.set('source', sourceFilter)

  const { data, isLoading, refetch } = useQuery<LogsResponse>({
    queryKey: ['logs', clienteId, page, levelFilter, sourceFilter],
    queryFn: async () => {
      const res = await fetch(`/api/logs?${queryParams.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch logs')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 15000,
  })

  const markReadMutation = useMutation({
    mutationFn: async (logIds: string[]) => {
      const res = await fetch('/api/logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logIds }),
      })
      if (!res.ok) throw new Error('Failed to mark as read')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      queryClient.invalidateQueries({ queryKey: ['logStats'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      if (!res.ok) throw new Error('Failed to mark all as read')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      queryClient.invalidateQueries({ queryKey: ['logStats'] })
      toast.success('Todos los logs marcados como leidos')
    },
  })

  const logs = data?.logs || []
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
          title="Procesamiento"
          description="Monitor de actividad y logs del sistema"
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Errores (24h)
            </div>
            {statsLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-2xl font-semibold text-red-600">
                {stats?.last24h.errors || 0}
              </p>
            )}
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Warnings (24h)
            </div>
            {statsLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-2xl font-semibold text-amber-600">
                {stats?.last24h.warnings || 0}
              </p>
            )}
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Exitosos (24h)
            </div>
            {statsLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-2xl font-semibold text-green-600">
                {stats?.last24h.success || 0}
              </p>
            )}
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <Info className="h-4 w-4 text-blue-500" />
              Sin leer
            </div>
            {statsLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-2xl font-semibold text-blue-600">
                {stats?.totalUnread || 0}
              </p>
            )}
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(1) }}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="ERROR" className="text-red-600">Errores</TabsTrigger>
              <TabsTrigger value="WARNING" className="text-amber-600">Warnings</TabsTrigger>
              <TabsTrigger value="SUCCESS" className="text-green-600">Exitosos</TabsTrigger>
              <TabsTrigger value="INFO" className="text-blue-600">Info</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1) }}>
            <TabsList>
              <TabsTrigger value="all">Todas las fuentes</TabsTrigger>
              <TabsTrigger value="OCR">OCR</TabsTrigger>
              <TabsTrigger value="PROCESSOR">Procesador</TabsTrigger>
              <TabsTrigger value="WATCHER">Monitor</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>

          {(stats?.totalUnread || 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="gap-1.5"
            >
              <CheckCheck className="h-4 w-4" />
              Marcar todos leidos
            </Button>
          )}
        </div>

        {/* Logs List */}
        <div className="bg-white border rounded-lg divide-y">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Info className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>No hay logs que mostrar</p>
              <p className="text-sm mt-1">Los logs apareceran cuando el sistema procese documentos</p>
            </div>
          ) : (
            logs.map((log) => {
              const config = levelConfig[log.level]
              const Icon = config.icon

              return (
                <div
                  key={log.id}
                  className={cn(
                    'p-4 flex gap-3 transition-colors',
                    !log.read && config.bg,
                    'hover:bg-slate-50'
                  )}
                  onClick={() => {
                    if (!log.read) {
                      markReadMutation.mutate([log.id])
                    }
                  }}
                >
                  <div className={cn('p-2 rounded-full h-fit', config.bg)}>
                    <Icon className={cn('h-4 w-4', config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        'text-sm',
                        !log.read && 'font-medium'
                      )}>
                        {log.message}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={cn('text-[10px]', config.badge)}>
                          {log.level}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {sourceLabels[log.source]}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>
                        {formatDistanceToNow(new Date(log.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                      {log.filename && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {log.filename}
                        </span>
                      )}
                      {log.documento_id && (
                        <Link
                          href={`/documento/${log.documento_id}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Ver documento
                        </Link>
                      )}
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                          Ver detalles
                        </summary>
                        <pre className="mt-1 p-2 bg-slate-100 rounded text-[10px] overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Mostrando {((pagination.page - 1) * pageSize) + 1} a{' '}
              {Math.min(pagination.page * pageSize, pagination.total)} de{' '}
              {pagination.total} logs
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
      </div>
    </DashboardLayout>
  )
}
