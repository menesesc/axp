'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export function useRealtimeDocumentos(clienteId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Crear canal de Supabase Realtime
    const channel = supabase
      .channel('documentos-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'documentos',
          filter: `clienteId=eq.${clienteId}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('📡 Realtime update:', payload)
          
          // Invalidar queries para refrescar datos
          queryClient.invalidateQueries({ queryKey: ['documentos', clienteId] })
          queryClient.invalidateQueries({ queryKey: ['stats', clienteId] })
        }
      )
      .subscribe()

    // Cleanup al desmontar
    return () => {
      supabase.removeChannel(channel)
    }
  }, [clienteId, queryClient])
}
