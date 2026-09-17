import type { Database as GeneratedDatabase } from './database.types'

type BaseTables = GeneratedDatabase['public']['Tables']
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

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Tables' | 'Functions'> & {
    Tables: Omit<BaseTables, 'school_classes' | 'students' | 'school_schedules' | 'school_settings'> & {
      academic_years: AcademicYearsTable
      school_classes: SchoolClassesTable
      students: StudentsTable
      school_schedules: SchoolSchedulesTable
      school_settings: SchoolSettingsTable
    }
    Functions: Omit<BaseFunctions, 'save_student_with_guardians'> & {
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
