'use client'

import { useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useDocumentNotifications(clienteId: string) {
  const [newDocumentIds, setNewDocumentIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const markAsViewed = useCallback((documentoId: string) => {
    setNewDocumentIds((prev) => {
      const next = new Set(prev)
      next.delete(documentoId)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setNewDocumentIds(new Set())
  }, [])

  useEffect(() => {
    if (!clienteId) return

    // Polling cada 10 segundos para nuevos documentos
    const checkForNew = async () => {
      try {
        const res = await fetch(`/api/documentos?clienteId=${clienteId}&limit=1`)
        if (res.ok) {
          // Invalidar cache para refrescar lista
          queryClient.invalidateQueries({ queryKey: ['documentos', clienteId] })
        }
      } catch (error) {
        console.error('Error checking for new documents:', error)
      }
    }

    // Primera verificación inmediata
    checkForNew()

    // Polling cada 10 segundos
    const interval = setInterval(checkForNew, 10000)

    return () => {
      clearInterval(interval)
    }
  }, [clienteId, queryClient])

  // Escuchar eventos custom desde el worker
  useEffect(() => {
    const handleNewDocument = (event: CustomEvent) => {
      const { documentoId } = event.detail
      if (documentoId) {
        setNewDocumentIds((prev) => new Set(prev).add(documentoId))
        // Invalidar cache para actualizar lista
        queryClient.invalidateQueries({ queryKey: ['documentos', clienteId] })
      }
    }

    window.addEventListener('new-document' as any, handleNewDocument)

    return () => {
      window.removeEventListener('new-document' as any, handleNewDocument)
    }
  }, [clienteId, queryClient])

  return {
    newDocumentIds,
    markAsViewed,
    clearAll,
    isNew: (documentoId: string) => newDocumentIds.has(documentoId),
  }
}
