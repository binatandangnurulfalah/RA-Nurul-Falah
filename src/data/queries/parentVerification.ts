import { queryOptions } from '@tanstack/react-query'
import type { Json } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { sanitizeSearch } from '../../lib/data-utils.js'
import { queryKeys } from '../queryKeys'

export type VerificationStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected'
export type VerificationType = 'family_profile' | 'child_link' | 'child_update'
export type VerificationPayload = Record<string, Json | undefined>

export type VerificationRequestRow = {
  id: string
  parent_user_id: string
  parent_display_name: string
  request_type: VerificationType
  subject_key: string
  target_student_id: string | null
  proposed_data: VerificationPayload
  current_data: VerificationPayload | null
  status: VerificationStatus
  supersedes_request_id: string | null
  reviewed_by: string | null
  review_comment: string | null
  matched_student_id: string | null
  submitted_at: string
  reviewed_at: string | null
  parent_seen_at: string | null
}

export type ParentFamilyProfileRow = {
  guardian_user_id: string
  account_display_name: string
  primary_phone: string | null
  family_card_no: string | null
  family_address: string | null
  father_name: string | null
  father_nik: string | null
  father_birth_place: string | null
  father_birth_date: string | null
  father_phone: string | null
  father_education: string | null
  father_occupation: string | null
  mother_name: string | null
  mother_nik: string | null
  mother_birth_place: string | null
  mother_birth_date: string | null
  mother_phone: string | null
  mother_education: string | null
  mother_occupation: string | null
  guardian_name: string | null
  guardian_nik: string | null
  guardian_relationship: string | null
  guardian_phone: string | null
  guardian_education: string | null
  guardian_occupation: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  verified_by: string | null
  verified_at: string | null
  updated_at: string
}

export type StudentParentDetailsRow = {
  student_id: string
  residential_address: string | null
  blood_type: string | null
  allergies: string | null
  health_notes: string | null
  special_needs: string | null
  photo_path: string | null
  birth_certificate_no: string | null
  school_admin_data: Json
  document_paths: Json
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

export type ParentChildRow = {
  id: string
  full_name: string
  nik: string | null
  nis: string | null
  nisn: string | null
  gender: 'L' | 'P' | null
  birth_place: string | null
  birth_date: string | null
  class_name: string | null
  academic_year: string | null
  is_active: boolean
  relationship?: string
  parent_details?: StudentParentDetailsRow | null
}

export type StudentCandidateRow = Omit<ParentChildRow, 'relationship' | 'parent_details'>

function payload(value: unknown): VerificationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as VerificationPayload) }
}

export function parentFamilyWorkspaceOptions(parentUserId: string) {
  return queryOptions({
    queryKey: queryKeys.verification.meta('parent-workspace', { parentUserId }),
    queryFn: async () => {
      const [familyResult, requestResult, guardianResult] = await Promise.all([
        supabase.from('parent_family_profiles').select('*').eq('guardian_user_id', parentUserId).maybeSingle(),
        supabase.from('parent_verification_requests')
          .select('id,parent_user_id,parent_display_name,request_type,subject_key,target_student_id,proposed_data,current_data,status,supersedes_request_id,reviewed_by,review_comment,matched_student_id,submitted_at,reviewed_at,parent_seen_at')
          .eq('parent_user_id', parentUserId)
          .order('submitted_at', { ascending: false }),
        supabase.from('student_guardians')
          .select('student_id,relationship')
          .eq('guardian_user_id', parentUserId),
      ])

      const firstError = familyResult.error || requestResult.error || guardianResult.error
      if (firstError) throw new Error(firstError.message || 'Data keluarga belum dapat dimuat.')

      const relationships = new Map((guardianResult.data ?? []).map((row) => [row.student_id, row.relationship]))
      const childIds = [...relationships.keys()]
      let students: StudentCandidateRow[] = []
      let details: StudentParentDetailsRow[] = []

      if (childIds.length) {
        const [studentResult, detailResult] = await Promise.all([
          supabase.from('students')
            .select('id,full_name,nik,nis,nisn,gender,birth_place,birth_date,class_name,academic_year,is_active')
            .in('id', childIds)
            .order('full_name'),
          supabase.from('student_parent_details')
            .select('*')
            .in('student_id', childIds),
        ])

        const childError = studentResult.error || detailResult.error
        if (childError) throw new Error(childError.message || 'Data anak belum dapat dimuat.')

        students = (studentResult.data as StudentCandidateRow[] | null) ?? []
        details = (detailResult.data as StudentParentDetailsRow[] | null) ?? []
      }

      const detailsByStudent = new Map(details.map((row) => [row.student_id, row]))
      return {
        family: (familyResult.data as ParentFamilyProfileRow | null) ?? null,
        requests: ((requestResult.data ?? []) as Omit<VerificationRequestRow, 'proposed_data' | 'current_data'>[]).map((row) => ({
          ...row,
          proposed_data: payload((row as { proposed_data?: unknown }).proposed_data),
          current_data: (row as { current_data?: unknown }).current_data ? payload((row as { current_data?: unknown }).current_data) : null,
        })) as VerificationRequestRow[],
        children: students.map((row) => ({
          ...row,
          relationship: relationships.get(row.id) ?? 'Wali',
          parent_details: detailsByStudent.get(row.id) ?? null,
        })) as ParentChildRow[],
      }
    },
    enabled: Boolean(parentUserId),
    staleTime: 20_000,
  })
}

export function verificationQueueOptions(status: VerificationStatus | 'all') {
  return queryOptions({
    queryKey: queryKeys.verification.list({ status }),
    queryFn: async () => {
      let query = supabase.from('parent_verification_requests')
        .select('id,parent_user_id,parent_display_name,request_type,subject_key,target_student_id,proposed_data,current_data,status,supersedes_request_id,reviewed_by,review_comment,matched_student_id,submitted_at,reviewed_at,parent_seen_at')
        .order('submitted_at', { ascending: false })
        .limit(200)
      if (status !== 'all') query = query.eq('status', status)
      const { data, error } = await query
      if (error) throw new Error(error.message || 'Antrean verifikasi belum dapat dimuat.')
      return ((data ?? []) as Omit<VerificationRequestRow, 'proposed_data' | 'current_data'>[]).map((row) => ({
        ...row,
        proposed_data: payload((row as { proposed_data?: unknown }).proposed_data),
        current_data: (row as { current_data?: unknown }).current_data ? payload((row as { current_data?: unknown }).current_data) : null,
      })) as VerificationRequestRow[]
    },
    staleTime: 15_000,
  })
}

export function verificationCandidatesOptions(search: string, enabled: boolean) {
  const normalized = sanitizeSearch(search)
  return queryOptions({
    queryKey: queryKeys.verification.meta('student-candidates', { search: normalized }),
    queryFn: async () => {
      let query = supabase.from('students')
        .select('id,full_name,nik,nis,nisn,gender,birth_place,birth_date,class_name,academic_year,is_active')
        .eq('is_active', true)
        .order('full_name')
        .limit(25)
      if (normalized) {
        query = query.or(`full_name.ilike.%${normalized}%,nis.ilike.%${normalized}%,nisn.ilike.%${normalized}%,nik.ilike.%${normalized}%`)
      }
      const { data, error } = await query
      if (error) throw new Error(error.message || 'Daftar siswa resmi belum dapat dimuat.')
      return (data as StudentCandidateRow[] | null) ?? []
    },
    enabled,
    staleTime: 15_000,
  })
}

export function verificationUnreadCountOptions(parentUserId: string) {
  return queryOptions({
    queryKey: queryKeys.verification.meta('unread', { parentUserId }),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('parent_verification_request_summaries')
        .select('id', { count: 'exact', head: true })
        .eq('parent_user_id', parentUserId)
        .eq('is_unread', true)
      if (error) throw new Error(error.message || 'Status verifikasi belum dibaca gagal dimuat.')
      return count ?? 0
    },
    enabled: Boolean(parentUserId),
    staleTime: 15_000,
  })
}

export async function markParentVerificationSeen(requestId: string) {
  const { error } = await supabase.rpc('mark_parent_verification_seen', {
    p_request_id: requestId,
  })
  if (error) throw new Error(error.message || 'Status pengajuan gagal ditandai sudah dibaca.')
  return true
}
