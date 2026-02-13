'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUser } from '@/hooks/use-user'
import { toast } from 'sonner'
import { Building2, Save, Loader2 } from 'lucide-react'

interface Empresa {
  id: string
  razonSocial: string
  cuit: string
  r2Prefix: string
  activo: boolean
}

export default function EmpresaPage() {
  const { clienteId, isAdmin } = useUser()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<Partial<Empresa>>({})

  const { data, isLoading } = useQuery<{ empresa: Empresa }>({
    queryKey: ['empresa', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/empresa')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Empresa>) => {
      const res = await fetch('/api/configuracion/empresa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] })
      setIsEditing(false)
      toast.success('Empresa actualizada')
    },
    onError: () => {
      toast.error('Error al actualizar')
    },
  })

  const empresa = data?.empresa

  const handleEdit = () => {
    if (empresa) {
      setFormData({
        razonSocial: empresa.razonSocial,
        cuit: empresa.cuit,
      })
      setIsEditing(true)
    }
  }

  const handleSave = () => {
    updateMutation.mutate(formData)
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

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <Header
          title="Empresa"
          description="Información de tu empresa"
        />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : empresa ? (
          <div className="bg-white border rounded-lg">
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-slate-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">{empresa.razonSocial}</h2>
                  <p className="text-sm text-slate-500">CUIT: {empresa.cuit}</p>
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Razón Social
                    </label>
                    <Input
                      value={formData.razonSocial || ''}
                      onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      CUIT
                    </label>
                    <Input
                      value={formData.cuit || ''}
                      onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                      maxLength={11}
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSave} disabled={updateMutation.isPending}>
                      {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Save className="h-4 w-4 mr-2" />
                      Guardar
                    </Button>
                    <Button variant="ghost" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">Razón Social</p>
                      <p className="text-sm font-medium mt-1">{empresa.razonSocial}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">CUIT</p>
                      <p className="text-sm font-medium mt-1">{empresa.cuit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">ID Interno</p>
                      <p className="text-sm font-mono text-slate-600 mt-1">{empresa.id.slice(0, 8)}...</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">Estado</p>
                      <p className="text-sm mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${empresa.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {empresa.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <Button variant="outline" onClick={handleEdit}>
                      Editar información
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            No se encontró información de la empresa
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
