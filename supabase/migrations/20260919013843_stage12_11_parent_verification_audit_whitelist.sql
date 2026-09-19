alter table public.audit_events
  drop constraint if exists audit_events_table_name_check;

alter table public.audit_events
  add constraint audit_events_table_name_check
  check (
    table_name = any (
      array[
        'academic_years'::text,
        'announcements'::text,
        'attendance_records'::text,
        'school_classes'::text,
        'school_documents'::text,
        'school_settings'::text,
        'student_guardians'::text,
        'student_payments'::text,
        'payment_transactions'::text,
        'students'::text,
        'teacher_class_assignments'::text,
        'teacher_profiles'::text,
        'report_cards'::text,
        'account_management'::text,
        'parent_family_profiles'::text,
        'parent_verification_requests'::text,
        'student_parent_details'::text
      ]
    )
  );
