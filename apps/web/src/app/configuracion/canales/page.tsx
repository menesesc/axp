'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
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
  FileText,
  RotateCcw,
  Save,
  Users,
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

interface Usuario {
  id: string
  email: string
  nombre: string
  activo: boolean
}

interface EmailTemplate {
  tipo: 'ORDEN_PAGO' | 'COMPARTIR_DOCUMENTOS'
  asunto: string
  cuerpo: string
  isCustom: boolean
  activo: boolean
}

const TEMPLATE_LABELS: Record<string, { title: string; description: string; variables: string }> = {
  ORDEN_PAGO: {
    title: 'Orden de Pago',
    description: 'Se envía automáticamente al emitir una orden de pago y al compartir por email.',
    variables: '{{empresa}}, {{empresaCuit}}, {{proveedor}}, {{monto}}, {{numero}}, {{fecha}}, {{nota}}, {{mensaje}}',
  },
  COMPARTIR_DOCUMENTOS: {
    title: 'Compartir Documentos',
    description: 'Se envía al compartir documentos por email desde la vista de documentos.',
    variables: '{{empresa}}, {{empresaCuit}}, {{mensaje}}',
  },
}

export default function CanalesPage() {
  const { clienteId, isAdmin } = useUser()
  const queryClient = useQueryClient()
  const [copiedEmail, setCopiedEmail] = useState(false)

  // Templates editing state
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [editAsunto, setEditAsunto] = useState('')
  const [editCuerpo, setEditCuerpo] = useState('')

  const { data, isLoading } = useQuery<{ canales: CanalConfig }>({
    queryKey: ['canales', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/canales')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId && isAdmin,
  })

  const { data: usuariosData } = useQuery<{ usuarios: Usuario[] }>({
    queryKey: ['usuarios', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/usuarios')
      if (!res.ok) throw new Error('Failed to fetch usuarios')
      return res.json()
    },
    enabled: !!clienteId && isAdmin,
  })

  const emailsAutorizados = (usuariosData?.usuarios || []).filter((u) => u.activo && u.email)

  const { data: templatesData, isLoading: templatesLoading } = useQuery<{ templates: EmailTemplate[] }>({
    queryKey: ['email-templates', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/templates')
      if (!res.ok) throw new Error('Failed to fetch templates')
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

  const saveTemplateMutation = useMutation({
    mutationFn: async ({ tipo, asunto, cuerpo }: { tipo: string; asunto: string; cuerpo: string }) => {
      const res = await fetch('/api/configuracion/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, asunto, cuerpo }),
      })
      if (!res.ok) throw new Error('Failed to save template')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      setEditingTemplate(null)
      toast.success('Plantilla guardada')
    },
    onError: () => {
      toast.error('Error al guardar plantilla')
    },
  })

  const resetTemplateMutation = useMutation({
    mutationFn: async (tipo: string) => {
      const res = await fetch('/api/configuracion/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      })
      if (!res.ok) throw new Error('Failed to reset template')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      setEditingTemplate(null)
      toast.success('Plantilla restaurada a predeterminada')
    },
    onError: () => {
      toast.error('Error al restaurar plantilla')
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
  }

  const startEditing = (template: EmailTemplate) => {
    setEditingTemplate(template.tipo)
    setEditAsunto(template.asunto)
    setEditCuerpo(template.cuerpo)
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
  const templates = templatesData?.templates || []

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Header
          title="Canales de Recepción"
          description="Configura cómo recibir documentos y plantillas de email"
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
                      Reenviá las facturas que recibas de tus proveedores a esta dirección para procesarlas automáticamente.
                    </p>
                  </div>

                  <div className="mt-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <label className="text-xs text-slate-500 uppercase tracking-wider">
                        Emails autorizados para reenvío
                      </label>
                    </div>
                    {emailsAutorizados.length > 0 ? (
                      <div className="space-y-1">
                        {emailsAutorizados.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded text-sm"
                          >
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-700">{u.email}</span>
                            <span className="text-slate-400">—</span>
                            <span className="text-slate-500">{u.nombre}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No hay usuarios activos con email</p>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      Solo se procesan emails reenviados desde estas direcciones. Para agregar más, andá a{' '}
                      <a href="/configuracion/usuarios" className="text-blue-600 hover:underline">
                        Configuración &gt; Usuarios
                      </a>.
                    </p>
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

        {/* Email Templates Section */}
        <Separator />

        <Header
          title="Plantillas de Email"
          description="Personaliza los emails que se envían desde el sistema"
        />

        {templatesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => {
              const info = TEMPLATE_LABELS[template.tipo]!
              const isEditing = editingTemplate === template.tipo

              return (
                <div key={template.tipo} className="bg-white border rounded-lg p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{info.title}</h3>
                          {template.isCustom && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                              Personalizado
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{info.description}</p>
                      </div>
                    </div>
                    {!isEditing && (
                      <Button variant="outline" size="sm" onClick={() => startEditing(template)}>
                        Editar
                      </Button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Asunto
                        </label>
                        <Input
                          value={editAsunto}
                          onChange={(e) => setEditAsunto(e.target.value)}
                          placeholder="Asunto del email"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Cuerpo (HTML)
                        </label>
                        <textarea
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[200px] resize-y font-mono"
                          value={editCuerpo}
                          onChange={(e) => setEditCuerpo(e.target.value)}
                          placeholder="Contenido HTML del email"
                        />
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-xs font-medium text-slate-600 mb-1">Variables disponibles:</p>
                        <p className="text-xs text-slate-500 font-mono">{info.variables}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Usa {'{{#variable}}...{{/variable}}'} para bloques condicionales.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        {template.isCustom && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resetTemplateMutation.mutate(template.tipo)}
                            disabled={resetTemplateMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4 mr-1.5" />
                            Restaurar predeterminado
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingTemplate(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveTemplateMutation.mutate({
                            tipo: template.tipo,
                            asunto: editAsunto,
                            cuerpo: editCuerpo,
                          })}
                          disabled={saveTemplateMutation.isPending || !editAsunto || !editCuerpo}
                        >
                          {saveTemplateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-1.5" />
                          )}
                          Guardar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pt-4 border-t">
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">
                            Asunto
                          </label>
                          <p className="text-sm text-slate-700 font-mono bg-slate-50 px-3 py-2 rounded">
                            {template.asunto}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">
                            Vista previa del cuerpo
                          </label>
                          <div
                            className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded max-h-32 overflow-y-auto"
                            dangerouslySetInnerHTML={{
                              __html: template.cuerpo
                                .replace(/\{\{[^}]+\}\}/g, '<span class="text-blue-600 font-mono text-xs">$&</span>')
                                .replace(/\{\{#[^}]+\}\}/g, '')
                                .replace(/\{\{\/[^}]+\}\}/g, ''),
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
