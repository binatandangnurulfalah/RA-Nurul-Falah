import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { type AppRole, supabase, type UserProfile } from '../../lib/supabase'
import { getPageRange, sanitizeSearch } from '../../lib/data-utils.js'
import { queryKeys } from '../queryKeys'

export type AccountRow = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>
export type AccountStats = { total: number; teachers: number; parents: number }

export function accountPageOptions({ page, pageSize, search, roleFilter }: { page: number; pageSize: number; search: string; roleFilter: 'all' | AppRole }) {
  const normalizedSearch = sanitizeSearch(search)
  return queryOptions({
    queryKey: queryKeys.accounts.list({ page, pageSize, search: normalizedSearch, roleFilter }),
    queryFn: async () => {
      const range = getPageRange(page, pageSize)
      let query = supabase
        .from('user_profiles')
        .select('id,role,display_name,is_active,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(range.from, range.to)
      if (roleFilter !== 'all') query = query.eq('role', roleFilter)
      if (normalizedSearch) query = query.ilike('display_name', `%${normalizedSearch}%`)
      const { data, error, count } = await query
      if (error) throw new Error(error.message || 'Data akun gagal dimuat.')
      return { rows: (data as AccountRow[] | null) ?? [], total: count ?? 0 }
    },
    placeholderData: keepPreviousData,
  })
}

export function accountStatsOptions() {
  return queryOptions({
    queryKey: queryKeys.accounts.meta('stats'),
    queryFn: async () => {
      const [allCount, teacherCount, parentCount] = await Promise.all([
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'parent'),
      ])
      const error = allCount.error || teacherCount.error || parentCount.error
      if (error) throw new Error(error.message || 'Ringkasan akun gagal dimuat.')
      return { total: allCount.count ?? 0, teachers: teacherCount.count ?? 0, parents: parentCount.count ?? 0 } satisfies AccountStats
    },
  })
}
