import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { getPageRange, sanitizeSearch } from '../../lib/data-utils.js'
import { queryKeys } from '../queryKeys'

export type AttendanceRecordRow = {
  id: string
  student_id: string
  attendance_date: string
  check_in: string | null
  check_out: string | null
  status: string
  created_at: string
  student_full_name: string
  student_class_name: string | null
  student_nis: string | null
}
export type AttendanceStudent = { id: string; full_name: string; nis: string | null; class_name: string | null }
export type AttendanceSummary = { total_records: number; checked_out_records: number; late_records: number }
const EMPTY_SUMMARY: AttendanceSummary = { total_records: 0, checked_out_records: 0, late_records: 0 }
const JAKARTA = 'Asia/Jakarta'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())

export type AttendancePageParams = {
  page: number
  pageSize: number
  search: string
  dateFilter: string
  statusFilter: string
  parentView: boolean
  childId: string
}

export function attendancePageOptions(params: AttendancePageParams) {
  const normalizedSearch = sanitizeSearch(params.search)
  return queryOptions({
    queryKey: queryKeys.attendance.list({ page: params.page, pageSize: params.pageSize, search: normalizedSearch, date: params.dateFilter, status: params.statusFilter, parentView: params.parentView, childId: params.childId }),
    queryFn: async () => {
      const range = getPageRange(params.page, params.pageSize)
      let query = supabase
        .from('attendance_records_search')
        .select('id,student_id,attendance_date,check_in,check_out,status,created_at,student_full_name,student_class_name,student_nis', { count: 'exact' })
        .order('attendance_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(range.from, range.to)
      if (params.parentView && params.childId) query = query.eq('student_id', params.childId)
      if (params.dateFilter) query = query.eq('attendance_date', params.dateFilter)
      if (params.statusFilter !== 'all') query = query.eq('status', params.statusFilter)
      if (normalizedSearch) query = query.or(`student_full_name.ilike.%${normalizedSearch}%,student_nis.ilike.%${normalizedSearch}%,student_class_name.ilike.%${normalizedSearch}%`)
      const { data, error, count } = await query
      if (error) throw new Error(error.message || 'Data absensi gagal dimuat.')
      return { rows: (data as AttendanceRecordRow[] | null) ?? [], total: count ?? 0 }
    },
    placeholderData: keepPreviousData,
  })
}

export function attendanceMetaOptions({ canManage, parentView, childId }: { canManage: boolean; parentView: boolean; childId: string }) {
  return queryOptions({
    queryKey: queryKeys.attendance.meta('students-summary', { canManage, parentView, childId }),
    queryFn: async () => {
      const [studentsResult, summaryResult] = await Promise.all([
        canManage
          ? supabase.from('students').select('id,full_name,nis,class_name').eq('is_active', true).order('full_name')
          : Promise.resolve({ data: [] as AttendanceStudent[], error: null }),
        supabase.rpc('attendance_summary_for_date', { p_date: TODAY, p_student_id: parentView ? childId || undefined : undefined }),
      ])
      const error = studentsResult.error || summaryResult.error
      if (error) throw new Error(error.message || 'Data pendukung absensi gagal dimuat.')
      return {
        students: (studentsResult.data as AttendanceStudent[] | null) ?? [],
        summary: ((summaryResult.data as AttendanceSummary[] | null)?.[0]) ?? EMPTY_SUMMARY,
      }
    },
  })
}
