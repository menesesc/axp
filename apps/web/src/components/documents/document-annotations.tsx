'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquareWarning, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/hooks/use-user'

interface Anotacion {
  id: string
  texto: string
  createdAt: string
  usuario: string
}

interface DocumentAnnotationsProps {
  documentoId: string
  collapsed?: boolean
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DocumentAnnotations({ documentoId, collapsed = false }: DocumentAnnotationsProps) {
  const queryClient = useQueryClient()
  const { isAdmin } = useUser()
  const [isAdding, setIsAdding] = useState(false)
  const [newText, setNewText] = useState('')

  const { data, isLoading } = useQuery<{ anotaciones: Anotacion[] }>({
    queryKey: ['anotaciones', documentoId],
    queryFn: async () => {
      const res = await fetch(`/api/documentos/${documentoId}/anotaciones`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (texto: string) => {
      const res = await fetch(`/api/documentos/${documentoId}/anotaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      if (!res.ok) throw new Error('Failed to create')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anotaciones', documentoId] })
      queryClient.invalidateQueries({ queryKey: ['anotaciones'] })
      setNewText('')
      setIsAdding(false)
      toast.success('Anotación agregada')
    },
    onError: () => {
      toast.error('Error al agregar anotación')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (anotacionId: string) => {
      const res = await fetch(`/api/documentos/${documentoId}/anotaciones?anotacionId=${anotacionId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anotaciones', documentoId] })
      queryClient.invalidateQueries({ queryKey: ['anotaciones'] })
      toast.success('Anotación eliminada')
    },
    onError: () => {
      toast.error('Error al eliminar anotación')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newText.trim()) {
      createMutation.mutate(newText.trim())
    }
  }

  const anotaciones = data?.anotaciones || []
  const hasAnnotations = anotaciones.length > 0

  if (collapsed) {
    return hasAnnotations ? (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-xs">
        <MessageSquareWarning className="h-3.5 w-3.5" />
        <span>{anotaciones.length} anotación{anotaciones.length > 1 ? 'es' : ''}</span>
      </div>
    ) : null
  }

  return (
    <div className="bg-white border rounded-lg">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareWarning className={`h-4 w-4 ${hasAnnotations ? 'text-amber-600' : 'text-slate-400'}`} />
          <h3 className="text-sm font-medium">
            Anotaciones
            {hasAnnotations && <span className="ml-1 text-amber-600">({anotaciones.length})</span>}
          </h3>
        </div>
        {isAdmin && !isAdding && (
          <Button variant="ghost" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      <div className="p-4">
        {isAdding && (
          <form onSubmit={handleSubmit} className="mb-4">
            <Textarea
              placeholder="Escribe una nota sobre este documento..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              className="mb-2"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false)
                  setNewText('')
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!newText.trim() || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Guardar
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
          </div>
        ) : anotaciones.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">
            Sin anotaciones
          </p>
        ) : (
          <div className="space-y-3">
            {anotaciones.map((anotacion) => (
              <div
                key={anotacion.id}
                className="p-3 bg-amber-50 border border-amber-100 rounded-lg"
              >
                <p className="text-sm text-slate-900">{anotacion.texto}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {formatDateTime(anotacion.createdAt)} — {anotacion.usuario}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        if (confirm('¿Eliminar esta anotación?')) {
                          deleteMutation.mutate(anotacion.id)
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Badge component to show in document lists
export function AnnotationBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
      <MessageSquareWarning className="h-3 w-3" />
      {count}
    </div>
  )
}
