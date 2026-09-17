import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import type { AppRole, RequesterProfile } from './auth.ts'
import { HttpError } from './response.ts'

export function requireRole(profile: RequesterProfile, allowed: AppRole[], message = 'Anda tidak memiliki izin untuk tindakan ini.') {
  if (!profile.is_active || !allowed.includes(profile.role)) throw new HttpError(403, message)
}

export async function teacherCanAccessClass(admin: SupabaseClient, teacherUserId: string, classId?: string | null, className?: string | null) {
  const { data: teacher } = await admin
    .from('teacher_profiles')
    .select('id')
    .eq('teacher_user_id', teacherUserId)
    .maybeSingle()
  if (!teacher) return false

  let resolvedClassId = classId ?? null
  if (!resolvedClassId && className) {
    const { data: schoolClass } = await admin
      .from('school_classes')
      .select('id')
      .eq('name', className)
      .eq('is_active', true)
      .maybeSingle()
    resolvedClassId = schoolClass?.id ?? null
  }
  if (!resolvedClassId) return false

  const { data: assignment } = await admin
    .from('teacher_class_assignments')
    .select('class_id')
    .eq('class_id', resolvedClassId)
    .eq('teacher_profile_id', teacher.id)
    .maybeSingle()
  return Boolean(assignment)
}

export async function teacherCanAccessStudent(admin: SupabaseClient, teacherUserId: string, studentId: string) {
  const { data: student } = await admin
    .from('students')
    .select('class_name')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) return false
  return teacherCanAccessClass(admin, teacherUserId, null, student.class_name ?? null)
}
