import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { getPageRange, sanitizeSearch } from '../../lib/data-utils.js'
import { queryKeys } from '../queryKeys'

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'EVENT'
export type AuditTable =
  | 'academic_years'
  | 'announcements'
  | 'attendance_records'
  | 'school_classes'
  | 'school_documents'
  | 'school_settings'
  | 'student_guardians'
  | 'student_payments'
  | 'students'
  | 'teacher_class_assignments'
  | 'teacher_profiles'
  | 'report_cards'
  | 'account_management'

export type AuditEventRow = {
  id: number
  table_name: AuditTable
  record_id: string | null
  record_key: string
  action: AuditAction
  event_name: string | null
  actor_user_id: string | null
  actor_role: 'admin' | 'teacher' | 'parent' | null
  actor_display_name: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_fields: string[]
  changed_at: string
}

export type AuditPageParams = {
  page: number
  pageSize: number
  tableFilter: string
  actionFilter: string
  dateFilter: string
  actorSearch: string
}

function jakartaDateRange(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const startDate = new Date(`${date}T00:00:00+07:00`)
  if (Number.isNaN(startDate.getTime())) return null
  const endDate = new Date(startDate.getTime() + 86_400_000)
  return { start: startDate.toISOString(), end: endDate.toISOString() }
}

export function auditPageOptions(params: AuditPageParams) {
  const normalizedActor = sanitizeSearch(params.actorSearch)
  return queryOptions({
    queryKey: queryKeys.audit.list({
      page: params.page,
      pageSize: params.pageSize,
      table: params.tableFilter,
      action: params.actionFilter,
      date: params.dateFilter,
      actor: normalizedActor,
    }),
    queryFn: async () => {
      const range = getPageRange(params.page, params.pageSize)
      let query = supabase
        .from('audit_events_view')
        .select('id,table_name,record_id,record_key,action,event_name,actor_user_id,actor_role,actor_display_name,old_data,new_data,changed_fields,changed_at', { count: 'exact' })
        .order('changed_at', { ascending: false })
        .range(range.from, range.to)

      if (params.tableFilter !== 'all') query = query.eq('table_name', params.tableFilter)
      if (params.actionFilter !== 'all') query = query.eq('action', params.actionFilter)
      if (normalizedActor) query = query.ilike('actor_display_name', `%${normalizedActor}%`)

      const dateRange = jakartaDateRange(params.dateFilter)
      if (dateRange) query = query.gte('changed_at', dateRange.start).lt('changed_at', dateRange.end)

      const { data, error, count } = await query
      if (error) throw new Error(error.message || 'Riwayat aktivitas gagal dimuat.')
      return { rows: (data as AuditEventRow[] | null) ?? [], total: count ?? 0 }
    },
    placeholderData: keepPreviousData,
  })
}
