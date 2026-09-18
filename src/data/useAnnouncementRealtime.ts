import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'
import { supabase } from '../lib/supabase'

export function useAnnouncementRealtime(currentUserId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel(`announcement-feed:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        () => {
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all }),
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
