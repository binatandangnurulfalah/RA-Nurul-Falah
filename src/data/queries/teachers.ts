import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { supabase, type UserProfile } from '../../lib/supabase'
import { getPageRange, sanitizeSearch } from '../../lib/data-utils.js'
import { queryKeys } from '../queryKeys'

export type TeacherAccount = Pick<UserProfile, 'id' | 'display_name' | 'phone' | 'is_active'>
export type TeacherProfileRow = {
  id: string
  teacher_user_id: string | null
  full_name: string
  nik: string | null
  employee_no: string | null
  nuptk: string | null
  position: string | null
  employment_status: string | null
  education: string | null
  gender: 'L' | 'P' | null
  birth_place: string | null
  birth_date: string | null
  joined_date: string | null
  notes: string | null
}

type LinkedTeacherAccount = { teacher_user_id: string | null }
export type TeacherStats = { total: number; linked: number; unlinked: number }

export function teacherPageOptions({ page, pageSize, search }: { page: number; pageSize: number; search: string }) {
  const normalizedSearch = sanitizeSearch(search)
  return queryOptions({
    queryKey: queryKeys.teachers.list({ page, pageSize, search: normalizedSearch }),
    queryFn: async () => {
      const range = getPageRange(page, pageSize)
      let query = supabase
        .from('teacher_profiles_search')
        .select('id,teacher_user_id,full_name,nik,employee_no,nuptk,position,employment_status,education,gender,birth_place,birth_date,joined_date,notes', { count: 'exact' })
        .order('full_name')
        .range(range.from, range.to)
      if (normalizedSearch) query = query.or(`full_name.ilike.%${normalizedSearch}%,nik.ilike.%${normalizedSearch}%,employee_no.ilike.%${normalizedSearch}%,nuptk.ilike.%${normalizedSearch}%,position.ilike.%${normalizedSearch}%`)
      const { data, error, count } = await query
      if (error) throw new Error(error.message || 'Data guru gagal dimuat.')
      return { rows: (data as TeacherProfileRow[] | null) ?? [], total: count ?? 0 }
    },
    placeholderData: keepPreviousData,
  })
}

export function teacherMetaOptions() {
  return queryOptions({
    queryKey: queryKeys.teachers.meta('accounts-and-stats'),
    queryFn: async () => {
      const [accountsResult, linkedIdsResult, totalResult, linkedResult] = await Promise.all([
        supabase.from('user_profiles').select('id,display_name,phone,is_active').eq('role', 'teacher').order('display_name'),
        supabase.from('teacher_profiles').select('teacher_user_id').not('teacher_user_id', 'is', null),
        supabase.from('teacher_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('teacher_profiles').select('id', { count: 'exact', head: true }).not('teacher_user_id', 'is', null),
      ])
      const error = accountsResult.error || linkedIdsResult.error || totalResult.error || linkedResult.error
      if (error) throw new Error(error.message || 'Data pendukung guru gagal dimuat.')
      const linkedIds = ((linkedIdsResult.data as LinkedTeacherAccount[] | null) ?? [])
        .map((row) => row.teacher_user_id)
        .filter((id): id is string => Boolean(id))
      const total = totalResult.count ?? 0
      const linked = linkedResult.count ?? 0
      return {
        accounts: (accountsResult.data as TeacherAccount[] | null) ?? [],
        linkedAccountIds: linkedIds,
        stats: { total, linked, unlinked: Math.max(0, total - linked) } satisfies TeacherStats,
      }
    },
    staleTime: 60_000,
  })
}
