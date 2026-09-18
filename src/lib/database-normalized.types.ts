import type { Database as GeneratedDatabase, Json } from './database.types'

type BaseTables = GeneratedDatabase['public']['Tables']
type BaseViews = GeneratedDatabase['public']['Views']
type BaseFunctions = GeneratedDatabase['public']['Functions']

type PatchTable<
  T extends { Row: unknown; Insert: unknown; Update: unknown; Relationships: unknown },
  RowPatch,
  InsertPatch,
  UpdatePatch,
  Relationships = T['Relationships'],
> = Omit<T, 'Row' | 'Insert' | 'Update' | 'Relationships'> & {
  Row: T['Row'] & RowPatch
  Insert: T['Insert'] & InsertPatch
  Update: T['Update'] & UpdatePatch
  Relationships: Relationships
}

type AcademicYearsTable = {
  Row: {
    created_at: string
    created_by: string | null
    end_date: string
    id: string
    is_active: boolean
    is_current: boolean
    label: string
    start_date: string
    updated_at: string
  }
  Insert: {
    created_at?: string
    created_by?: string | null
    end_date: string
    id?: string
    is_active?: boolean
    is_current?: boolean
    label: string
    start_date: string
    updated_at?: string
  }
  Update: {
    created_at?: string
    created_by?: string | null
    end_date?: string
    id?: string
    is_active?: boolean
    is_current?: boolean
    label?: string
    start_date?: string
    updated_at?: string
  }
  Relationships: []
}

type SchoolClassesTable = PatchTable<
  BaseTables['school_classes'],
  { academic_year_id: string },
  { academic_year_id: string },
  { academic_year_id?: string },
  [{
    foreignKeyName: 'school_classes_academic_year_id_fkey'
    columns: ['academic_year_id']
    isOneToOne: false
    referencedRelation: 'academic_years'
    referencedColumns: ['id']
  }]
>

type StudentsTable = PatchTable<
  BaseTables['students'],
  { academic_year_id: string; class_id: string | null },
  { academic_year_id: string; class_id?: string | null },
  { academic_year_id?: string; class_id?: string | null },
  [
    {
      foreignKeyName: 'students_academic_year_id_fkey'
      columns: ['academic_year_id']
      isOneToOne: false
      referencedRelation: 'academic_years'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'students_class_id_fkey'
      columns: ['class_id']
      isOneToOne: false
      referencedRelation: 'school_classes'
      referencedColumns: ['id']
    },
  ]
>

type SchoolSchedulesTable = PatchTable<
  BaseTables['school_schedules'],
  { academic_year_id: string; class_id: string },
  { academic_year_id: string; class_id: string },
  { academic_year_id?: string; class_id?: string },
  [
    {
      foreignKeyName: 'school_schedules_academic_year_id_fkey'
      columns: ['academic_year_id']
      isOneToOne: false
      referencedRelation: 'academic_years'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'school_schedules_class_id_fkey'
      columns: ['class_id']
      isOneToOne: false
      referencedRelation: 'school_classes'
      referencedColumns: ['id']
    },
  ]
>

type SchoolSettingsTable = PatchTable<
  BaseTables['school_settings'],
  { academic_year_id: string; single_teacher_class_mode: boolean },
  { academic_year_id: string; single_teacher_class_mode?: boolean },
  { academic_year_id?: string; single_teacher_class_mode?: boolean },
  [{
    foreignKeyName: 'school_settings_academic_year_id_fkey'
    columns: ['academic_year_id']
    isOneToOne: false
    referencedRelation: 'academic_years'
    referencedColumns: ['id']
  }]
>

type StudentPaymentsTable = PatchTable<
  BaseTables['student_payments'],
  { is_waived: boolean },
  { is_waived?: boolean },
  { is_waived?: boolean }
>

type PaymentTransactionsTable = {
  Row: {
    id: string
    payment_id: string
    amount: number
    paid_at: string
    method: 'cash' | 'bank_transfer' | 'qris' | 'other' | 'legacy'
    reference_no: string | null
    notes: string | null
    created_by: string | null
    created_at: string
    voided_at: string | null
    voided_by: string | null
    void_reason: string | null
  }
  Insert: {
    id?: string
    payment_id: string
    amount: number
    paid_at?: string
    method?: 'cash' | 'bank_transfer' | 'qris' | 'other' | 'legacy'
    reference_no?: string | null
    notes?: string | null
    created_by?: string | null
    created_at?: string
    voided_at?: string | null
    voided_by?: string | null
    void_reason?: string | null
  }
  Update: {
    id?: string
    payment_id?: string
    amount?: number
    paid_at?: string
    method?: 'cash' | 'bank_transfer' | 'qris' | 'other' | 'legacy'
    reference_no?: string | null
    notes?: string | null
    created_by?: string | null
    created_at?: string
    voided_at?: string | null
    voided_by?: string | null
    void_reason?: string | null
  }
  Relationships: [
    {
      foreignKeyName: 'payment_transactions_payment_id_fkey'
      columns: ['payment_id']
      isOneToOne: false
      referencedRelation: 'student_payments'
      referencedColumns: ['id']
    },
  ]
}

type SchoolDocumentsTable = PatchTable<
  BaseTables['school_documents'],
  {
    storage_path: string | null
    external_url: string | null
    original_file_name: string | null
    mime_type: string | null
    file_size_bytes: number | null
  },
  {
    storage_path?: string | null
    external_url?: string | null
    original_file_name?: string | null
    mime_type?: string | null
    file_size_bytes?: number | null
  },
  {
    storage_path?: string | null
    external_url?: string | null
    original_file_name?: string | null
    mime_type?: string | null
    file_size_bytes?: number | null
  }
>

type AuditEventsTable = Omit<BaseTables['audit_events'], 'Row' | 'Insert' | 'Update'> & {
  Row: Omit<BaseTables['audit_events']['Row'], 'record_id'> & {
    record_id: string | null
    record_key: string
    changed_fields: string[]
    event_name: string | null
  }
  Insert: Omit<BaseTables['audit_events']['Insert'], 'record_id'> & {
    record_id?: string | null
    record_key: string
    changed_fields?: string[]
    event_name?: string | null
  }
  Update: Omit<BaseTables['audit_events']['Update'], 'record_id'> & {
    record_id?: string | null
    record_key?: string
    changed_fields?: string[]
    event_name?: string | null
  }
}

type AuditEventsView = Omit<BaseViews['audit_events_view'], 'Row'> & {
  Row: BaseViews['audit_events_view']['Row'] & {
    record_key: string | null
    changed_fields: string[] | null
    event_name: string | null
  }
}


type ParentFamilyProfilesTable = {
  Row: {
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
    created_at: string
    updated_at: string
  }
  Insert: {
    guardian_user_id: string
    account_display_name: string
    primary_phone?: string | null
    family_card_no?: string | null
    family_address?: string | null
    father_name?: string | null
    father_nik?: string | null
    father_birth_place?: string | null
    father_birth_date?: string | null
    father_phone?: string | null
    father_education?: string | null
    father_occupation?: string | null
    mother_name?: string | null
    mother_nik?: string | null
    mother_birth_place?: string | null
    mother_birth_date?: string | null
    mother_phone?: string | null
    mother_education?: string | null
    mother_occupation?: string | null
    guardian_name?: string | null
    guardian_nik?: string | null
    guardian_relationship?: string | null
    guardian_phone?: string | null
    guardian_education?: string | null
    guardian_occupation?: string | null
    emergency_contact_name?: string | null
    emergency_contact_phone?: string | null
    verified_by?: string | null
    verified_at?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: Partial<ParentFamilyProfilesTable['Insert']>
  Relationships: []
}

type ParentVerificationRequestsTable = {
  Row: {
    id: string
    parent_user_id: string
    parent_display_name: string
    request_type: 'family_profile' | 'child_link' | 'child_update'
    subject_key: string
    target_student_id: string | null
    proposed_data: Json
    current_data: Json | null
    status: 'pending' | 'approved' | 'changes_requested' | 'rejected'
    supersedes_request_id: string | null
    reviewed_by: string | null
    review_comment: string | null
    matched_student_id: string | null
    submitted_at: string
    reviewed_at: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    parent_user_id: string
    parent_display_name: string
    request_type: 'family_profile' | 'child_link' | 'child_update'
    subject_key: string
    target_student_id?: string | null
    proposed_data: Json
    current_data?: Json | null
    status?: 'pending' | 'approved' | 'changes_requested' | 'rejected'
    supersedes_request_id?: string | null
    reviewed_by?: string | null
    review_comment?: string | null
    matched_student_id?: string | null
    submitted_at?: string
    reviewed_at?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: Partial<ParentVerificationRequestsTable['Insert']>
  Relationships: []
}

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Tables' | 'Views' | 'Functions'> & {
    Tables: Omit<BaseTables, 'academic_years' | 'audit_events' | 'school_classes' | 'school_documents' | 'student_payments' | 'payment_transactions' | 'students' | 'school_schedules' | 'school_settings'> & {
      academic_years: AcademicYearsTable
      parent_family_profiles: ParentFamilyProfilesTable
      parent_verification_requests: ParentVerificationRequestsTable
      audit_events: AuditEventsTable
      school_classes: SchoolClassesTable
      school_documents: SchoolDocumentsTable
      student_payments: StudentPaymentsTable
      payment_transactions: PaymentTransactionsTable
      students: StudentsTable
      school_schedules: SchoolSchedulesTable
      school_settings: SchoolSettingsTable
    }
    Views: Omit<BaseViews, 'audit_events_view'> & {
      audit_events_view: AuditEventsView
    }
    Functions: Omit<BaseFunctions,
      | 'save_school_settings'
      | 'save_school_settings_with_policy'
      | 'save_student_charge'
      | 'record_payment_transaction'
      | 'void_payment_transaction'
      | 'delete_student_charge'
      | 'announcement_unread_count'
      | 'mark_announcements_read'
      | 'enqueue_school_document_storage_cleanup'
      | 'append_account_audit_event'
      | 'save_academic_year'
      | 'save_student_with_guardians'
      | 'update_my_avatar'
    > & {
      save_school_settings: {
        Args: {
          p_school_name: string
          p_address: string | null
          p_phone: string | null
          p_email: string | null
          p_late_cutoff: string
          p_academic_year_id: string
        }
        Returns: boolean
      }
      save_school_settings_with_policy: {
        Args: {
          p_school_name: string
          p_address: string | null
          p_phone: string | null
          p_email: string | null
          p_late_cutoff: string
          p_academic_year_id: string
          p_single_teacher_class_mode: boolean
        }
        Returns: boolean
      }
      save_student_charge: {
        Args: {
          p_payment_id: string | null
          p_student_id: string
          p_payment_type: string
          p_period_label: string | null
          p_amount: number
          p_due_date: string | null
          p_is_waived: boolean
          p_notes: string | null
        }
        Returns: string
      }
      record_payment_transaction: {
        Args: {
          p_payment_id: string
          p_amount: number
          p_paid_at: string | null
          p_method: string
          p_reference_no: string | null
          p_notes: string | null
        }
        Returns: string
      }
      void_payment_transaction: {
        Args: { p_transaction_id: string; p_reason: string }
        Returns: string
      }
      delete_student_charge: {
        Args: { p_payment_id: string }
        Returns: string
      }
      announcement_unread_count: {
        Args: never
        Returns: number
      }
      mark_announcements_read: {
        Args: { p_announcement_ids: string[] }
        Returns: number
      }
      enqueue_school_document_storage_cleanup: {
        Args: { p_object_path: string }
        Returns: string
      }
      append_account_audit_event: {
        Args: {
          p_target_user_id: string
          p_event_name: string
          p_details?: Json
        }
        Returns: number
      }
      save_academic_year: {
        Args: {
          p_academic_year_id?: string
          p_is_active?: boolean
          p_is_current?: boolean
          p_label?: string
        }
        Returns: string
      }
      save_student_with_guardians: {
        Args: BaseFunctions['save_student_with_guardians']['Args']
        Returns: StudentsTable['Row']
      }
      update_my_avatar: {
        Args: { p_avatar_path?: string | null }
        Returns: BaseTables['user_profiles']['Row']
      }

      submit_parent_family_verification: {
        Args: { p_payload: Json; p_supersedes_request_id?: string | null }
        Returns: string
      }
      submit_parent_child_verification: {
        Args: { p_target_student_id: string | null; p_payload: Json; p_supersedes_request_id?: string | null }
        Returns: string
      }
      review_parent_verification_request: {
        Args: { p_request_id: string; p_action: string; p_comment?: string | null; p_matched_student_id?: string | null }
        Returns: Json
      }
    }
  }
}
