'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit2, Trash2, Search, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Proveedor {
  id: string
  razonSocial: string
  cuit: string | null
  alias: string[]
  letra: string | null
  activo: boolean
  _count: {
    documentos: number
  }
}

interface ProveedoresResponse {
  proveedores: Proveedor[]
}

export default function ProveedoresPage() {
  const clienteId = process.env.NEXT_PUBLIC_CLIENTE_ID!
  const queryClient = useQueryClient()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | null>(null)
  const [formData, setFormData] = useState({
    razonSocial: '',
    cuit: '',
    alias: '',
    letra: '',
  })

  // Obtener proveedores
  const { data, isLoading } = useQuery<ProveedoresResponse>({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch(`/api/proveedores?clienteId=${clienteId}`)
      if (!res.ok) throw new Error('Failed to fetch proveedores')
      return res.json()
    },
  })

  // Crear proveedor
  const createMutation = useMutation({
    mutationFn: async (data: { razonSocial: string; cuit: string; alias: string[]; letra: string | null }) => {
      const res = await fetch('/api/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, clienteId }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create proveedor')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores', clienteId] })
      setIsModalOpen(false)
      resetForm()
    },
  })

  // Actualizar proveedor
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/proveedores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update proveedor')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores', clienteId] })
      setIsModalOpen(false)
      setEditingProveedor(null)
      resetForm()
    },
  })

  // Eliminar/desactivar proveedor
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/proveedores/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete proveedor')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores', clienteId] })
    },
  })

  const resetForm = () => {
    setFormData({ razonSocial: '', cuit: '', alias: '', letra: '' })
    setEditingProveedor(null)
  }

  const handleOpenModal = (proveedor?: Proveedor) => {
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
    
    const aliasArray = formData.alias
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0)

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
    p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.cuit?.includes(searchTerm) ||
    p.alias.some(a => a.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Cargando proveedores...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header con botón de volver */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={20} />
          Volver al Dashboard
        </Link>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Proveedores</h1>
          <p className="text-gray-600">
            Gestiona los proveedores de tu empresa
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Nuevo Proveedor
        </button>
      </div>

      {/* Buscador */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre, CUIT o alias..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Lista de proveedores */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {filteredProveedores.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500">No se encontraron proveedores</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Razón Social
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CUIT
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Letra
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Alias
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Documentos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProveedores.map((proveedor) => (
                  <tr key={proveedor.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {proveedor.razonSocial}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {proveedor.cuit || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {proveedor.letra ? (
                          <Badge variant="outline" className="font-mono">
                            {proveedor.letra}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {proveedor.alias.length > 0 ? (
                          proveedor.alias.map((alias, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {alias}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {proveedor._count.documentos}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={proveedor.activo ? 'success' : 'outline'}>
                        {proveedor.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(proveedor)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`¿Estás seguro de ${proveedor._count.documentos > 0 ? 'desactivar' : 'eliminar'} este proveedor?`)) {
                              deleteMutation.mutate(proveedor.id)
                            }
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={proveedor._count.documentos > 0 ? 'Desactivar' : 'Eliminar'}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de creación/edición */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">
              {editingProveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Razón Social <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.razonSocial}
                  onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: CARNES DEL SUDOESTE SRL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  CUIT
                </label>
                <input
                  type="text"
                  value={formData.cuit}
                  onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: 30-12345678-9"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Letra por Defecto
                </label>
                <select
                  value={formData.letra}
                  onChange={(e) => setFormData({ ...formData, letra: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin letra por defecto</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Letra que usa este proveedor en sus facturas (se usará si OCR no detecta)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Alias (separados por comas)
                </label>
                <input
                  type="text"
                  value={formData.alias}
                  onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: CARNES SUDOESTE, DEL SUDOESTE"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Nombres alternativos para el matching automático del OCR
                </p>
              </div>

              {(createMutation.error || updateMutation.error) && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {createMutation.error?.message || updateMutation.error?.message}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    resetForm()
                  }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Guardando...'
                    : editingProveedor
                    ? 'Actualizar'
                    : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
