-- Stage 12.3: evidence-based redundant index cleanup.
--
-- Both indexes below are strict leading-column duplicates of UNIQUE btree
-- indexes that remain in place:
--   school_classes_academic_year_name_key (academic_year_id, name)
--   school_schedules_class_slot_key       (class_id, day_of_week, start_time)
--
-- Production pg_stat_user_indexes reported zero scans for the single-column
-- copies, while the covering UNIQUE indexes preserve lookup and FK-supporting
-- access paths on the same leading columns.

drop index if exists public.school_classes_academic_year_id_idx;
drop index if exists public.school_schedules_class_id_idx;
