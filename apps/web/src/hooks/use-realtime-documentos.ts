'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export function useRealtimeDocumentos(clienteId: string) {
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClient(), [])
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
      .channel(`documentos-changes-${clienteId}`)
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

          if (payload.eventType === 'INSERT' && payload.new?.id) {
            setNewDocumentIds((prev) => new Set(prev).add(payload.new.id))
          }

          queryClient.invalidateQueries({ queryKey: ['documentos', clienteId] })
          queryClient.invalidateQueries({ queryKey: ['stats', clienteId] })
        }
      )
      .subscribe((status, err) => {
        console.log('📡 Realtime status:', status, err || '')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clienteId, queryClient, supabase])

  return { isNew, clearAll, newDocumentIds }
}
