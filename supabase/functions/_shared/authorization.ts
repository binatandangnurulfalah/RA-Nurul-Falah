import type { AuthContext, AppRole } from './auth.ts'
import { jsonResponse } from './response.ts'

export function requireRole(context: AuthContext, roles: AppRole[], message = 'Anda tidak memiliki akses untuk tindakan ini.') {
  return roles.includes(context.profile.role) ? null : jsonResponse({ ok: false, error: message }, 403)
}

export async function teacherCanAccessClass(context: AuthContext, classId: string) {
  if (context.profile.role === 'admin') return true
  if (context.profile.role !== 'teacher') return false

  const { data: teacher } = await context.adminClient
    .from('teacher_profiles')
    .select('id')
    .eq('teacher_user_id', context.user.id)
    .maybeSingle()
  if (!teacher) return false

  const { data: assignment } = await context.adminClient
    .from('teacher_class_assignments')
    .select('class_id')
    .eq('class_id', classId)
    .eq('teacher_profile_id', teacher.id)
    .maybeSingle()

  return Boolean(assignment)
}

export async function teacherCanAccessStudent(context: AuthContext, studentId: string) {
  if (context.profile.role === 'admin') return true
  if (context.profile.role !== 'teacher') return false

  const { data: student } = await context.adminClient
    .from('students')
    .select('class_id')
    .eq('id', studentId)
    .maybeSingle()
  if (!student?.class_id) return false

  return teacherCanAccessClass(context, student.class_id)
}
