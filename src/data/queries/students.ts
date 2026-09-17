import { queryOptions } from '@tanstack/react-query'
import { supabase, type UserProfile } from '../../lib/supabase'
import { getPageRange, sanitizeSearch } from '../../lib/data-utils.js'
import { queryKeys } from '../queryKeys'

export type StudentRow = {
  id: string
  full_name: string
  nis: string | null
  nisn: string | null
  nik: string | null
  gender: 'L' | 'P' | null
  birth_place: string | null
  birth_date: string | null
  class_name: string | null
  academic_year: string | null
  is_active: boolean
  qr_token: string
}

export type StudentAccount = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>
export type StudentClass = { id: string; name: string; academic_year: string; is_active: boolean }
export type StudentPageParams = { page: number; pageSize: number; search: string; classFilter: string }

export function studentPageOptions(params: StudentPageParams) {
  const normalizedSearch = sanitizeSearch(params.search)
  return queryOptions({
    queryKey: queryKeys.students.list({ page: params.page, pageSize: params.pageSize, search: normalizedSearch, classFilter: params.classFilter }),
    queryFn: async () => {
      const range = getPageRange(params.page, params.pageSize)
      let query = supabase.from('students').select('*', { count: 'exact' }).order('full_name').range(range.from, range.to)
      if (params.classFilter !== 'all') query = query.eq('class_name', params.classFilter)
      if (normalizedSearch) query = query.or(`full_name.ilike.%${normalizedSearch}%,nik.ilike.%${normalizedSearch}%,nis.ilike.%${normalizedSearch}%,nisn.ilike.%${normalizedSearch}%`)
      const { data, error, count } = await query
      if (error) throw new Error(error.message || 'Data murid gagal dimuat.')
      return { rows: (data as StudentRow[] | null) ?? [], total: count ?? 0 }
    },
  })
}

export function studentLookupsOptions() {
  return queryOptions({
    queryKey: queryKeys.students.meta('lookups'),
    queryFn: async () => {
      const [parents, classes] = await Promise.all([
        supabase.from('user_profiles').select('id,role,display_name,is_active,created_at').eq('role', 'parent').eq('is_active', true).order('display_name'),
        supabase.from('school_classes').select('id,name,academic_year,is_active').eq('is_active', true).order('name'),
      ])
      const error = parents.error || classes.error
      if (error) throw new Error(error.message || 'Data pendukung murid gagal dimuat.')
      return {
        parents: (parents.data as StudentAccount[] | null) ?? [],
        classes: (classes.data as StudentClass[] | null) ?? [],
      }
    },
    staleTime: 60_000,
  })
}
