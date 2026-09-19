import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'
import { supabase } from '../lib/supabase'

export function useParentVerificationRealtime(currentUserId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel(`parent-verification:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parent_verification_requests' },
        () => {
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.verification.all }),
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
          ])
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, queryClient])
}
