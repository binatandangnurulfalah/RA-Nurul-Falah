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
  { academic_year_id: string },
  { academic_year_id: string },
  { academic_year_id?: string },
  [{
    foreignKeyName: 'school_settings_academic_year_id_fkey'
    columns: ['academic_year_id']
    isOneToOne: false
    referencedRelation: 'academic_years'
    referencedColumns: ['id']
  }]
>

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

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Tables' | 'Views' | 'Functions'> & {
    Tables: Omit<BaseTables, 'audit_events' | 'school_classes' | 'school_documents' | 'students' | 'school_schedules' | 'school_settings'> & {
      academic_years: AcademicYearsTable
      audit_events: AuditEventsTable
      school_classes: SchoolClassesTable
      school_documents: SchoolDocumentsTable
      students: StudentsTable
      school_schedules: SchoolSchedulesTable
      school_settings: SchoolSettingsTable
    }
    Views: Omit<BaseViews, 'audit_events_view'> & {
      audit_events_view: AuditEventsView
    }
    Functions: Omit<BaseFunctions, 'save_student_with_guardians'> & {
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
    }
  }
}
