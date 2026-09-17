export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_allowlist: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          used_at?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          attendance_date: string
          check_in: string | null
          check_in_by: string | null
          check_out: string | null
          check_out_by: string | null
          correction_reason: string | null
          created_at: string
          id: string
          last_corrected_at: string | null
          last_corrected_by: string | null
          recorded_by: string | null
          source: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          attendance_date?: string
          check_in?: string | null
          check_in_by?: string | null
          check_out?: string | null
          check_out_by?: string | null
          correction_reason?: string | null
          created_at?: string
          id?: string
          last_corrected_at?: string | null
          last_corrected_by?: string | null
          recorded_by?: string | null
          source?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          check_in?: string | null
          check_in_by?: string | null
          check_out?: string | null
          check_out_by?: string | null
          correction_reason?: string | null
          created_at?: string
          id?: string
          last_corrected_at?: string | null
          last_corrected_by?: string | null
          recorded_by?: string | null
          source?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          changed_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          changed_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          changed_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          academic_year: string
          created_at: string
          created_by: string | null
          growth_notes: string | null
          id: string
          identity_independence: string | null
          is_published: boolean
          literacy_steam: string | null
          religion_character: string | null
          semester: number
          student_id: string
          teacher_note: string | null
          updated_at: string
        }
        Insert: {
          academic_year: string
          created_at?: string
          created_by?: string | null
          growth_notes?: string | null
          id?: string
          identity_independence?: string | null
          is_published?: boolean
          literacy_steam?: string | null
          religion_character?: string | null
          semester: number
          student_id: string
          teacher_note?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          created_by?: string | null
          growth_notes?: string | null
          id?: string
          identity_independence?: string | null
          is_published?: boolean
          literacy_steam?: string | null
          religion_character?: string | null
          semester?: number
          student_id?: string
          teacher_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_classes: {
        Row: {
          academic_year: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          teacher_name: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          teacher_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      school_document_storage_cleanup: {
        Row: {
          attempts: number
          id: string
          last_error: string | null
          object_path: string
          queued_at: string
        }
        Insert: {
          attempts?: number
          id?: string
          last_error?: string | null
          object_path: string
          queued_at?: string
        }
        Update: {
          attempts?: number
          id?: string
          last_error?: string | null
          object_path?: string
          queued_at?: string
        }
        Relationships: []
      }
      school_documents: {
        Row: {
          audience: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          document_date: string | null
          document_number: string | null
          file_url: string | null
          id: string
          is_published: boolean
          recipient: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_date?: string | null
          document_number?: string | null
          file_url?: string | null
          id?: string
          is_published?: boolean
          recipient?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_date?: string | null
          document_number?: string | null
          file_url?: string | null
          id?: string
          is_published?: boolean
          recipient?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_schedules: {
        Row: {
          academic_year: string
          activity: string
          class_name: string
          created_at: string
          created_by: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          teacher_name: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: string
          activity: string
          class_name: string
          created_at?: string
          created_by?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string
          activity?: string
          class_name?: string
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          teacher_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      school_settings: {
        Row: {
          academic_year: string
          address: string | null
          email: string | null
          id: number
          late_cutoff: string
          phone: string | null
          school_name: string
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          academic_year?: string
          address?: string | null
          email?: string | null
          id?: number
          late_cutoff?: string
          phone?: string | null
          school_name?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          academic_year?: string
          address?: string | null
          email?: string | null
          id?: number
          late_cutoff?: string
          phone?: string | null
          school_name?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      student_guardians: {
        Row: {
          created_at: string
          guardian_user_id: string
          relationship: string
          student_id: string
        }
        Insert: {
          created_at?: string
          guardian_user_id: string
          relationship?: string
          student_id: string
        }
        Update: {
          created_at?: string
          guardian_user_id?: string
          relationship?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          notes: string | null
          paid_amount: number
          paid_at: string | null
          payment_type: string
          period_label: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_type: string
          period_label?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_type?: string
          period_label?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          academic_year: string | null
          birth_date: string | null
          birth_place: string | null
          class_name: string | null
          created_at: string
          created_by: string | null
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          nik: string | null
          nis: string | null
          nisn: string | null
          qr_token: string
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          birth_date?: string | null
          birth_place?: string | null
          class_name?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          nik?: string | null
          nis?: string | null
          nisn?: string | null
          qr_token?: string
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          birth_date?: string | null
          birth_place?: string | null
          class_name?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          nik?: string | null
          nis?: string | null
          nisn?: string | null
          qr_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_class_assignments: {
        Row: {
          class_id: string
          created_at: string
          teacher_profile_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          teacher_profile_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          teacher_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "school_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_teacher_profile_id_fkey"
            columns: ["teacher_profile_id"]
            isOneToOne: false
            referencedRelation: "teacher_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_teacher_profile_id_fkey"
            columns: ["teacher_profile_id"]
            isOneToOne: false
            referencedRelation: "teacher_profiles_search"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_profiles: {
        Row: {
          birth_date: string | null
          birth_place: string | null
          created_at: string
          education: string | null
          employee_no: string | null
          employment_status: string | null
          full_name: string
          gender: string | null
          id: string
          joined_date: string | null
          nik: string | null
          notes: string | null
          nuptk: string | null
          position: string | null
          teacher_user_id: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          birth_place?: string | null
          created_at?: string
          education?: string | null
          employee_no?: string | null
          employment_status?: string | null
          full_name: string
          gender?: string | null
          id?: string
          joined_date?: string | null
          nik?: string | null
          notes?: string | null
          nuptk?: string | null
          position?: string | null
          teacher_user_id?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          birth_place?: string | null
          created_at?: string
          education?: string | null
          employee_no?: string | null
          employment_status?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          joined_date?: string | null
          nik?: string | null
          notes?: string | null
          nuptk?: string | null
          position?: string | null
          teacher_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_profiles_teacher_user_id_fkey"
            columns: ["teacher_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          address: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      attendance_records_search: {
        Row: {
          attendance_date: string | null
          check_in: string | null
          check_out: string | null
          created_at: string | null
          id: string | null
          recorded_by: string | null
          status: string | null
          student_class_name: string | null
          student_full_name: string | null
          student_id: string | null
          student_nis: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events_view: {
        Row: {
          action: string | null
          actor_display_name: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          changed_at: string | null
          id: number | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
        }
        Relationships: []
      }
      report_cards_search: {
        Row: {
          academic_year: string | null
          created_at: string | null
          created_by: string | null
          growth_notes: string | null
          id: string | null
          identity_independence: string | null
          is_published: boolean | null
          literacy_steam: string | null
          religion_character: string | null
          semester: number | null
          student_class_name: string | null
          student_full_name: string | null
          student_id: string | null
          teacher_note: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_payments_search: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          id: string | null
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          payment_type: string | null
          period_label: string | null
          status: string | null
          student_class_name: string | null
          student_full_name: string | null
          student_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_profiles_search: {
        Row: {
          account_display_name: string | null
          account_is_active: boolean | null
          account_phone: string | null
          birth_date: string | null
          birth_place: string | null
          created_at: string | null
          education: string | null
          employee_no: string | null
          employment_status: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          joined_date: string | null
          nik: string | null
          notes: string | null
          nuptk: string | null
          position: string | null
          teacher_user_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_profiles_teacher_user_id_fkey"
            columns: ["teacher_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      attendance_summary_for_date: {
        Args: { p_date: string; p_student_id?: string }
        Returns: {
          checked_out_records: number
          late_records: number
          total_records: number
        }[]
      }
      dashboard_summary: { Args: never; Returns: Json }
      payment_summary: {
        Args: { p_student_id?: string }
        Returns: {
          total_billed: number
          total_outstanding: number
          total_paid: number
        }[]
      }
      save_class_with_assignments: {
        Args: {
          p_academic_year: string
          p_class_id: string
          p_is_active: boolean
          p_name: string
          p_teacher_profile_ids: string[]
        }
        Returns: string
      }
      save_student_with_guardians: {
        Args: {
          p_academic_year?: string
          p_birth_date?: string
          p_birth_place?: string
          p_class_name?: string
          p_full_name: string
          p_gender?: string
          p_guardian_user_ids?: string[]
          p_is_active?: boolean
          p_nik?: string
          p_nis?: string
          p_nisn?: string
          p_student_id: string
        }
        Returns: {
          academic_year: string | null
          birth_date: string | null
          birth_place: string | null
          class_name: string | null
          created_at: string
          created_by: string | null
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          nik: string | null
          nis: string | null
          nisn: string | null
          qr_token: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_profile: {
        Args: {
          p_address?: string
          p_bio?: string
          p_display_name: string
          p_phone?: string
        }
        Returns: {
          address: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "parent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher", "parent"],
    },
  },
} as const
