'use client'

import { useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export function useRealtimeDocumentos(clienteId: string) {
  const queryClient = useQueryClient()
  const [newDocumentIds, setNewDocumentIds] = useState<Set<string>>(new Set())

  const clearAll = useCallback(() => {
    setNewDocumentIds(new Set())
  }, [])

  const isNew = useCallback(
    (documentoId: string) => newDocumentIds.has(documentoId),
    [newDocumentIds]
  )

  useEffect(() => {
    if (!clienteId) return

    const channel = supabase
      .channel('documentos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos',
          filter: `clienteId=eq.${clienteId}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('📡 Realtime update:', payload)

          // Marcar INSERTs como nuevos para highlight visual
          if (payload.eventType === 'INSERT' && payload.new?.id) {
            setNewDocumentIds((prev) => new Set(prev).add(payload.new.id))
          }

          queryClient.invalidateQueries({ queryKey: ['documentos', clienteId] })
          queryClient.invalidateQueries({ queryKey: ['stats', clienteId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clienteId, queryClient])

  return { isNew, clearAll, newDocumentIds }
}
