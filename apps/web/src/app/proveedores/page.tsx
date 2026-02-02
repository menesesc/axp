'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageHeader } from '@/components/layout/header'
import { useUser } from '@/hooks/use-user'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Building2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  FileText,
  CheckCircle,
  XCircle,
  Hash,
} from 'lucide-react'

interface Proveedor {
  id: string
  razonSocial: string
  cuit: string | null
  alias: string[]
  letra: string | null
  activo: boolean
  documentosCount: number
}

// Badge de estado del proveedor
function ProveedorStatusBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        activo
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-slate-100 text-slate-600 border border-slate-200'
      )}
    >
      {activo ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

// Badge de letra
function LetraBadge({ letra }: { letra: string | null }) {
  if (!letra) return <span className="text-slate-400">-</span>

  const colors: Record<string, string> = {
    A: 'bg-blue-50 text-blue-700 border-blue-200',
    B: 'bg-amber-50 text-amber-700 border-amber-200',
    C: 'bg-purple-50 text-purple-700 border-purple-200',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold border',
        colors[letra] || 'bg-slate-50 text-slate-600 border-slate-200'
      )}
    >
      {letra}
    </span>
  )
}

export default function ProveedoresPage() {
  const { clienteId, isAdmin } = useUser()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [filterActivo, setFilterActivo] = useState<'all' | 'activo' | 'inactivo'>('all')
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
      toast.success('Proveedor creado exitosamente')
    },
    onError: (error: Error) => {
      toast.error(error.message)
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
      toast.success('Proveedor actualizado exitosamente')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/proveedores/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] })
      if (data.softDelete) {
        toast.success('Proveedor desactivado')
      } else {
        toast.success('Proveedor eliminado')
      }
    },
    onError: () => {
      toast.error('Error al eliminar el proveedor')
    },
  })

  const toggleActivoMutation = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const res = await fetch(`/api/proveedores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: (_, { activo }) => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success(activo ? 'Proveedor activado' : 'Proveedor desactivado')
    },
    onError: (error: Error) => {
      toast.error(error.message)
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

  // Filtrar proveedores
  const filteredProveedores = data?.proveedores.filter(p => {
    const matchesSearch =
      p.razonSocial.toLowerCase().includes(search.toLowerCase()) ||
      p.cuit?.includes(search) ||
      p.alias.some(a => a.toLowerCase().includes(search.toLowerCase()))

    const matchesActivo =
      filterActivo === 'all' ||
      (filterActivo === 'activo' && p.activo) ||
      (filterActivo === 'inactivo' && !p.activo)

    return matchesSearch && matchesActivo
  }) || []

  // Stats
  const stats = {
    total: data?.proveedores.length || 0,
    activos: data?.proveedores.filter(p => p.activo).length || 0,
    inactivos: data?.proveedores.filter(p => !p.activo).length || 0,
  }

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
        <PageHeader
          title="Proveedores"
          description={`${stats.total} proveedores registrados, ${stats.activos} activos`}
        >
          {isAdmin && (
            <Button onClick={() => handleOpenModal()}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo Proveedor
            </Button>
          )}
        </PageHeader>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, CUIT o alias..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={filterActivo}
            onValueChange={(value) => setFilterActivo(value as 'all' | 'activo' | 'inactivo')}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="inactivo">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabla */}
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-medium">Proveedor</TableHead>
                <TableHead className="font-medium">CUIT</TableHead>
                <TableHead className="font-medium text-center">Letra</TableHead>
                <TableHead className="font-medium text-center">Documentos</TableHead>
                <TableHead className="font-medium">Estado</TableHead>
                {isAdmin && <TableHead className="w-12"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-6 w-6 mx-auto" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    {isAdmin && <TableCell><Skeleton className="h-8 w-8" /></TableCell>}
                  </TableRow>
                ))
              ) : filteredProveedores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} className="h-32">
                    <EmptyState
                      icon={Building2}
                      title="Sin proveedores"
                      description={search ? 'No se encontraron proveedores con esos criterios' : 'Comienza agregando tu primer proveedor'}
                      action={
                        isAdmin && !search ? (
                          <Button variant="outline" size="sm" onClick={() => handleOpenModal()}>
                            <Plus className="h-4 w-4 mr-1.5" />
                            Agregar proveedor
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredProveedores.map((proveedor) => (
                  <TableRow key={proveedor.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-slate-600" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{proveedor.razonSocial}</div>
                          {proveedor.alias.length > 0 && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {proveedor.alias.slice(0, 2).join(', ')}
                              {proveedor.alias.length > 2 && ` +${proveedor.alias.length - 2}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {proveedor.cuit ? (
                        <code className="text-sm text-slate-600 font-mono bg-slate-50 px-1.5 py-0.5 rounded">
                          {proveedor.cuit.replace(/(\d{2})(\d{8})(\d{1})/, '$1-$2-$3')}
                        </code>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <LetraBadge letra={proveedor.letra} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-1.5 text-slate-600">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{proveedor.documentosCount}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ProveedorStatusBadge activo={proveedor.activo} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenModal(proveedor)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleActivoMutation.mutate({
                                id: proveedor.id,
                                activo: !proveedor.activo,
                              })}
                            >
                              <Power className="h-4 w-4 mr-2" />
                              {proveedor.activo ? 'Desactivar' : 'Activar'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                if (confirm(
                                  proveedor.documentosCount > 0
                                    ? '¿Desactivar este proveedor? Tiene documentos asociados.'
                                    : '¿Eliminar este proveedor?'
                                )) {
                                  deleteMutation.mutate(proveedor.id)
                                }
                              }}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {proveedor.documentosCount > 0 ? 'Desactivar' : 'Eliminar'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Modal */}
        <Dialog open={isModalOpen} onOpenChange={(open: boolean) => {
          if (!open) {
            setIsModalOpen(false)
            resetForm()
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingProveedor ? (
                  <>
                    <Pencil className="h-5 w-5 text-slate-600" />
                    Editar Proveedor
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5 text-slate-600" />
                    Nuevo Proveedor
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {editingProveedor
                  ? 'Modifica los datos del proveedor.'
                  : 'Completa los datos para crear un nuevo proveedor.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Razón Social <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    required
                    value={formData.razonSocial}
                    onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                    placeholder="Nombre de la empresa"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">CUIT</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={formData.cuit}
                    onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                    placeholder="30-12345678-9"
                    className="pl-9 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Letra por defecto</label>
                <Select
                  value={formData.letra || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, letra: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar letra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin letra por defecto</SelectItem>
                    <SelectItem value="A">Letra A</SelectItem>
                    <SelectItem value="B">Letra B</SelectItem>
                    <SelectItem value="C">Letra C</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Alias
                  <span className="text-slate-400 font-normal ml-1">(separados por comas)</span>
                </label>
                <Input
                  value={formData.alias}
                  onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                  placeholder="Nombre corto, abreviatura, etc."
                />
                <p className="text-xs text-slate-500">
                  Los alias ayudan a identificar al proveedor en documentos.
                </p>
              </div>

              {(createMutation.error || updateMutation.error) && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {createMutation.error?.message || updateMutation.error?.message}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsModalOpen(false); resetForm() }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
