import { queryOptions } from '@tanstack/react-query'
import { type AppRole, supabase } from '../../lib/supabase'
import { queryKeys } from '../queryKeys'

export type AnnouncementRow = {
  id: string
  title: string
  body: string
  audience: 'all' | 'teacher' | 'parent'
  is_published: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export function announcementsOptions({ role, currentUserId }: { role: AppRole; currentUserId: string }) {
  return queryOptions({
    queryKey: queryKeys.announcements.list({ role, currentUserId }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id,title,body,audience,is_published,created_by,created_at,updated_at')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message || 'Pengumuman gagal dimuat.')
      return (data as AnnouncementRow[] | null) ?? []
    },
    staleTime: 30_000,
  })
}
