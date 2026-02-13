'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useUser } from '@/hooks/use-user'
import { toast } from 'sonner'
import { UserPlus, Mail, Phone, Shield, Eye, Loader2, Trash2, Check, X, Pencil } from 'lucide-react'

interface Usuario {
  id: string
  email: string
  nombre: string
  rol: 'SUPERADMIN' | 'ADMIN' | 'USER'
  tipo_acceso: 'ADMIN' | 'VIEWER'
  telefono: string | null
  activo: boolean
  canSendDocs: boolean
}

export default function UsuariosPage() {
  const { clienteId, isAdmin } = useUser()
  const queryClient = useQueryClient()
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [editingUser, setEditingUser] = useState<Usuario | null>(null)
  const [newUser, setNewUser] = useState({
    email: '',
    nombre: '',
    tipo_acceso: 'VIEWER' as 'ADMIN' | 'VIEWER',
    telefono: '',
  })

  const { data, isLoading } = useQuery<{ usuarios: Usuario[] }>({
    queryKey: ['usuarios', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/usuarios')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId && isAdmin,
  })

  const createMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const res = await fetch('/api/configuracion/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      setIsAddingUser(false)
      setNewUser({ email: '', nombre: '', tipo_acceso: 'VIEWER', telefono: '' })
      toast.success('Usuario creado. Se envió invitación por email.')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al crear usuario')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Usuario> }) => {
      const res = await fetch(`/api/configuracion/usuarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      toast.success('Usuario actualizado')
    },
    onError: () => {
      toast.error('Error al actualizar')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/configuracion/usuarios/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      toast.success('Usuario eliminado')
    },
    onError: () => {
      toast.error('Error al eliminar')
    },
  })

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-slate-500">
          No tienes permisos para acceder a esta sección
        </div>
      </DashboardLayout>
    )
  }

  const usuarios = data?.usuarios || []

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Header
            title="Usuarios"
            description={`${usuarios.length} usuario${usuarios.length !== 1 ? 's' : ''} en tu empresa`}
          />
          <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invitar usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invitar nuevo usuario</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email *
                  </label>
                  <Input
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre completo *
                  </label>
                  <Input
                    placeholder="Juan Pérez"
                    value={newUser.nombre}
                    onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Teléfono (para WhatsApp)
                  </label>
                  <Input
                    type="tel"
                    placeholder="+54 9 11 1234-5678"
                    value={newUser.telefono}
                    onChange={(e) => setNewUser({ ...newUser, telefono: e.target.value })}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Necesario para habilitar envío de documentos por WhatsApp
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tipo de acceso
                  </label>
                  <Select
                    value={newUser.tipo_acceso}
                    onValueChange={(v) => setNewUser({ ...newUser, tipo_acceso: v as 'ADMIN' | 'VIEWER' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <span>Solo lectura</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="ADMIN">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <span>Administrador</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setIsAddingUser(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => createMutation.mutate(newUser)}
                    disabled={!newUser.email || !newUser.nombre || createMutation.isPending}
                  >
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Enviar invitación
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit user dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar usuario</DialogTitle>
            </DialogHeader>
            {editingUser && (
              <div className="space-y-4 pt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={editingUser.email}
                    disabled
                    className="bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre completo
                  </label>
                  <Input
                    value={editingUser.nombre}
                    onChange={(e) => setEditingUser({ ...editingUser, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tipo de acceso
                  </label>
                  <Select
                    value={editingUser.tipo_acceso}
                    onValueChange={(v) => setEditingUser({ ...editingUser, tipo_acceso: v as 'ADMIN' | 'VIEWER' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <span>Solo lectura</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="ADMIN">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <span>Administrador</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">
                    Estado
                  </label>
                  <button
                    onClick={() => setEditingUser({ ...editingUser, activo: !editingUser.activo })}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      editingUser.activo
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {editingUser.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setEditingUser(null)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      updateMutation.mutate({
                        id: editingUser.id,
                        updates: {
                          tipo_acceso: editingUser.tipo_acceso,
                          activo: editingUser.activo,
                        },
                      })
                      setEditingUser(null)
                    }}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Guardar cambios
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Usuario</th>
                  <th className="px-4 py-3 text-left">Contacto</th>
                  <th className="px-4 py-3 text-center">Acceso</th>
                  <th className="px-4 py-3 text-center">Envío docs</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {usuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{usuario.nombre}</p>
                      <p className="text-sm text-slate-500">{usuario.rol}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Mail className="h-3.5 w-3.5" />
                        {usuario.email}
                      </div>
                      {usuario.telefono && (
                        <div className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
                          <Phone className="h-3.5 w-3.5" />
                          {usuario.telefono}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        usuario.tipo_acceso === 'ADMIN'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {usuario.tipo_acceso === 'ADMIN' ? (
                          <><Shield className="h-3 w-3" /> Admin</>
                        ) : (
                          <><Eye className="h-3 w-3" /> Lectura</>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => updateMutation.mutate({
                          id: usuario.id,
                          updates: { canSendDocs: !usuario.canSendDocs },
                        })}
                        className={`p-1.5 rounded-full ${
                          usuario.canSendDocs
                            ? 'bg-green-100 text-green-600'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                        title={usuario.canSendDocs ? 'Puede enviar documentos' : 'No puede enviar documentos'}
                      >
                        {usuario.canSendDocs ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        usuario.activo
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingUser(usuario)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (confirm('¿Eliminar este usuario?')) {
                              deleteMutation.mutate(usuario.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usuarios.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                No hay usuarios registrados
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
