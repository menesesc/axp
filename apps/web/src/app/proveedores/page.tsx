'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useUser } from '@/hooks/use-user'

interface Proveedor {
  id: string
  razonSocial: string
  cuit: string | null
  alias: string[]
  letra: string | null
  activo: boolean
  documentosCount: number
}

export default function ProveedoresPage() {
  const { clienteId, isAdmin } = useUser()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | null>(null)
  const [formData, setFormData] = useState({
    razonSocial: '',
    cuit: '',
    alias: '',
    letra: '',
  })

  const { data, isLoading } = useQuery<{ proveedores: Proveedor[] }>({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const createMutation = useMutation({
    mutationFn: async (data: { razonSocial: string; cuit: string; alias: string[]; letra: string | null }) => {
      const res = await fetch('/api/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] })
      setIsModalOpen(false)
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { razonSocial: string; cuit: string | null; alias: string[]; letra: string | null } }) => {
      const res = await fetch(`/api/proveedores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] })
      setIsModalOpen(false)
      setEditingProveedor(null)
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/proveedores/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] })
    },
  })

  const resetForm = () => {
    setFormData({ razonSocial: '', cuit: '', alias: '', letra: '' })
    setEditingProveedor(null)
  }

  const handleOpenModal = (proveedor?: Proveedor) => {
    if (!isAdmin) return
    if (proveedor) {
      setEditingProveedor(proveedor)
      setFormData({
        razonSocial: proveedor.razonSocial,
        cuit: proveedor.cuit || '',
        alias: proveedor.alias.join(', '),
        letra: proveedor.letra || '',
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const aliasArray = formData.alias.split(',').map(a => a.trim()).filter(a => a.length > 0)

    if (editingProveedor) {
      updateMutation.mutate({
        id: editingProveedor.id,
        data: {
          razonSocial: formData.razonSocial,
          cuit: formData.cuit || null,
          alias: aliasArray,
          letra: formData.letra || null,
        },
      })
    } else {
      createMutation.mutate({
        razonSocial: formData.razonSocial,
        cuit: formData.cuit,
        alias: aliasArray,
        letra: formData.letra || null,
      })
    }
  }

  const filteredProveedores = data?.proveedores.filter(p =>
    p.razonSocial.toLowerCase().includes(search.toLowerCase()) ||
    p.cuit?.includes(search) ||
    p.alias.some(a => a.toLowerCase().includes(search.toLowerCase()))
  ) || []

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-gray-500">No tienes acceso</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-medium text-gray-900">Proveedores</h1>
          {isAdmin && (
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800"
            >
              Nuevo
            </button>
          )}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
        />

        {/* Table */}
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Razón Social</th>
                <th className="px-4 py-3 font-medium">CUIT</th>
                <th className="px-4 py-3 font-medium">Letra</th>
                <th className="px-4 py-3 font-medium">Docs</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                {isAdmin && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-40" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-28" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-8" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-8" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>
                    {isAdmin && <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>}
                  </tr>
                ))
              ) : filteredProveedores.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                    No se encontraron proveedores
                  </td>
                </tr>
              ) : (
                filteredProveedores.map((proveedor) => (
                  <tr key={proveedor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{proveedor.razonSocial}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono">{proveedor.cuit || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{proveedor.letra || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{proveedor.documentosCount}</td>
                    <td className="px-4 py-3 text-gray-500">{proveedor.activo ? 'Activo' : 'Inactivo'}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenModal(proveedor)}
                            className="text-sm text-gray-500 hover:text-gray-900"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`¿${proveedor.documentosCount > 0 ? 'Desactivar' : 'Eliminar'} este proveedor?`)) {
                                deleteMutation.mutate(proveedor.id)
                              }
                            }}
                            className="text-sm text-red-500 hover:text-red-700"
                          >
                            {proveedor.documentosCount > 0 ? 'Desactivar' : 'Eliminar'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {isModalOpen && isAdmin && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h2 className="text-lg font-medium mb-4">
                {editingProveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Razón Social</label>
                  <input
                    type="text"
                    required
                    value={formData.razonSocial}
                    onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">CUIT</label>
                  <input
                    type="text"
                    value={formData.cuit}
                    onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="30-12345678-9"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Letra</label>
                  <select
                    value={formData.letra}
                    onChange={(e) => setFormData({ ...formData, letra: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    <option value="">Sin letra</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Alias (separados por comas)</label>
                  <input
                    type="text"
                    value={formData.alias}
                    onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>

                {(createMutation.error || updateMutation.error) && (
                  <div className="text-sm text-red-600">
                    {createMutation.error?.message || updateMutation.error?.message}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); resetForm() }}
                    className="flex-1 px-4 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 px-4 py-1.5 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
