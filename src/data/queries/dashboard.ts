import { queryOptions } from '@tanstack/react-query'
import { type AppRole, supabase } from '../../lib/supabase'
import { queryKeys } from '../queryKeys'

export type DashboardScheduleItem = {
  id: string
  class_name: string
  activity: string
  start_time: string
  end_time: string
  teacher_name: string | null
}

export type DashboardAttendanceItem = {
  id: string
  student_id: string
  student_name: string
  status: string
  check_in: string | null
  check_out: string | null
  event_time: string
}

export type DashboardAnnouncementItem = {
  id: string
  title: string
  created_at: string
}

export type DashboardSummary = {
  role: AppRole
  generated_at: string
  attendance_date: string
  active_students: number
  attendance_today: number
  recorded_today: number
  late_today: number
  absent_today: number
  unrecorded_today: number
  active_accounts: number
  draft_reports: number
  open_payments: number
  today_schedule_count: number
  published_announcements: number
  today_schedule: DashboardScheduleItem[]
  recent_attendance: DashboardAttendanceItem[]
  recent_announcements: DashboardAnnouncementItem[]
}

export type ParentTodayAttendance = {
  check_in: string | null
  check_out: string | null
  status: string
}

const JAKARTA = 'Asia/Jakarta'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())

export function dashboardSummaryOptions(role: AppRole) {
  return queryOptions({
    queryKey: queryKeys.dashboard.meta('summary', { role }),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_summary')
      if (error) throw new Error(error.message || 'Ringkasan dashboard gagal dimuat.')
      return data as unknown as DashboardSummary
    },
    staleTime: 15_000,
  })
}

export function parentTodayAttendanceOptions({ role, childId }: { role: AppRole; childId: string }) {
  const attendanceDate = today()
  return queryOptions({
    queryKey: queryKeys.dashboard.meta('parent-today-attendance', { role, childId, attendanceDate }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('check_in,check_out,status')
        .eq('student_id', childId)
        .eq('attendance_date', attendanceDate)
        .maybeSingle()
      if (error) throw new Error(error.message || 'Absensi anak hari ini gagal dimuat.')
      return (data as ParentTodayAttendance | null) ?? null
    },
    enabled: role === 'parent' && Boolean(childId),
    staleTime: 15_000,
  })
}
