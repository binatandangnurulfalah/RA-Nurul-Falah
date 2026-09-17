import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { getPageRange, sanitizeSearch } from '../../lib/data-utils.js'
import { queryKeys } from '../queryKeys'

export type PaymentStudent = { id: string; full_name: string; class_name: string | null; academic_year: string | null; is_active?: boolean }
export type PaymentRow = {
  id: string
  student_id: string
  payment_type: string
  period_label: string | null
  amount: number | string
  paid_amount: number | string
  due_date: string | null
  paid_at: string | null
  status: 'unpaid' | 'partial' | 'paid' | 'waived'
  notes: string | null
  created_at: string
  student_full_name: string
  student_class_name: string | null
}
export type PaymentSummary = { total_billed: number | string; total_paid: number | string; total_outstanding: number | string }
const EMPTY_SUMMARY: PaymentSummary = { total_billed: 0, total_paid: 0, total_outstanding: 0 }

export function paymentPageOptions({ page, pageSize, search, studentId }: { page: number; pageSize: number; search: string; studentId: string }) {
  const normalizedSearch = sanitizeSearch(search)
  return queryOptions({
    queryKey: queryKeys.payments.list({ page, pageSize, search: normalizedSearch, studentId }),
    queryFn: async () => {
      const range = getPageRange(page, pageSize)
      let query = supabase
        .from('student_payments_search')
        .select('id,student_id,payment_type,period_label,amount,paid_amount,due_date,paid_at,status,notes,created_at,student_full_name,student_class_name', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(range.from, range.to)
      if (studentId) query = query.eq('student_id', studentId)
      if (normalizedSearch) query = query.or(`student_full_name.ilike.%${normalizedSearch}%,student_class_name.ilike.%${normalizedSearch}%,payment_type.ilike.%${normalizedSearch}%,period_label.ilike.%${normalizedSearch}%`)
      const { data, error, count } = await query
      if (error) throw new Error(error.message || 'Data pembayaran gagal dimuat.')
      return { rows: (data as PaymentRow[] | null) ?? [], total: count ?? 0 }
    },
    placeholderData: keepPreviousData,
  })
}

export function paymentMetaOptions({ canManage, studentId }: { canManage: boolean; studentId: string }) {
  return queryOptions({
    queryKey: queryKeys.payments.meta('students-summary', { canManage, studentId }),
    queryFn: async () => {
      const [summaryResult, studentsResult] = await Promise.all([
        supabase.rpc('payment_summary', { p_student_id: studentId || undefined }),
        canManage
          ? supabase.from('students').select('id,full_name,class_name,academic_year,is_active').eq('is_active', true).order('full_name')
          : Promise.resolve({ data: [] as PaymentStudent[], error: null }),
      ])
      const error = summaryResult.error || studentsResult.error
      if (error) throw new Error(error.message || 'Data pendukung pembayaran gagal dimuat.')
      return {
        summary: ((summaryResult.data as PaymentSummary[] | null)?.[0]) ?? EMPTY_SUMMARY,
        students: (studentsResult.data as PaymentStudent[] | null) ?? [],
      }
    },
  })
}
