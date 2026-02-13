'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useUser } from '@/hooks/use-user'
import { toast } from 'sonner'
import {
  Mail,
  MessageCircle,
  FolderSync,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'

interface CanalConfig {
  email: {
    habilitado: boolean
    direccion: string
    alias: string[]
  }
  whatsapp: {
    habilitado: boolean
    numero: string | null
    webhook_url: string | null
  }
  sftp: {
    habilitado: boolean
    ruta: string
  }
}

export default function CanalesPage() {
  const { clienteId, isAdmin } = useUser()
  const queryClient = useQueryClient()
  const [copiedEmail, setCopiedEmail] = useState(false)

  const { data, isLoading } = useQuery<{ canales: CanalConfig }>({
    queryKey: ['canales', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/canales')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId && isAdmin,
  })

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<CanalConfig>) => {
      const res = await fetch('/api/configuracion/canales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canales'] })
      toast.success('Configuración actualizada')
    },
    onError: () => {
      toast.error('Error al actualizar')
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-slate-500">
          No tienes permisos para acceder a esta sección
        </div>
      </DashboardLayout>
    )
  }

  const canales = data?.canales

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Header
          title="Canales de Recepción"
          description="Configura cómo recibir documentos en tu empresa"
        />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Email */}
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Email</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Recibe documentos enviados a tu casilla dedicada
                    </p>
                  </div>
                </div>
                <Switch
                  checked={canales?.email.habilitado || false}
                  onCheckedChange={(checked) =>
                    updateMutation.mutate({ email: { ...canales?.email!, habilitado: checked } })
                  }
                />
              </div>

              {canales?.email.habilitado && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">
                      Dirección de recepción
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-slate-100 rounded text-sm font-mono">
                        {canales.email.direccion}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(canales.email.direccion)}
                      >
                        {copiedEmail ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Solo se procesarán documentos de remitentes autorizados según la configuración de Usuarios
                    </p>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">Remitentes autorizados</p>
                      <p className="text-amber-700 mt-0.5">
                        Solo se procesarán emails de remitentes autorizados según la configuración de Usuarios.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* WhatsApp */}
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">WhatsApp</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Recibe documentos enviados por WhatsApp
                    </p>
                  </div>
                </div>
                <Switch
                  checked={canales?.whatsapp.habilitado || false}
                  onCheckedChange={(checked) =>
                    updateMutation.mutate({ whatsapp: { ...canales?.whatsapp!, habilitado: checked } })
                  }
                />
              </div>

              {canales?.whatsapp.habilitado && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  {canales.whatsapp.numero ? (
                    <div>
                      <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">
                        Número de WhatsApp
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-slate-100 rounded text-sm font-mono">
                          {canales.whatsapp.numero}
                        </code>
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`https://wa.me/${canales.whatsapp.numero.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="text-sm text-slate-600">
                        El canal de WhatsApp está siendo configurado. Te notificaremos cuando esté listo.
                      </p>
                    </div>
                  )}

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">Remitentes autorizados</p>
                      <p className="text-amber-700 mt-0.5">
                        Solo se procesarán mensajes de remitentes autorizados según la configuración de Usuarios.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SFTP */}
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                    <FolderSync className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">SFTP / Drive</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Sincronización automática desde carpeta compartida
                    </p>
                  </div>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  Activo
                </span>
              </div>

              <div className="mt-4 pt-4 border-t">
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">
                    Carpeta de origen
                  </label>
                  <code className="block px-3 py-2 bg-slate-100 rounded text-sm font-mono">
                    {canales?.sftp.ruta || '/incoming'}
                  </code>
                  <p className="text-xs text-slate-500 mt-1">
                    Los archivos PDF se procesan automáticamente cada 5 minutos
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
