# Stage 12.3 — Database Performance Evidence Audit

Captured against Supabase production project `ranurulfalah` on 2026-09-18.

## Evidence snapshot

- PostgreSQL statistics were last reset on 2026-08-25.
- Public schema currently has 93 indexes using about 1272 kB in total.
- Supabase Performance Advisor reports 46 non-constraint indexes with zero scans, totaling about 680 kB.
- Current production datasets are still small: approximately 37 live `students`, 6 `teacher_profiles`, and several newer modules have zero or only a handful of live rows.
- `pg_stat_statements` shows current application queries completing at low single-digit millisecond means in the sampled workload; no temp files or deadlocks were reported in the database statistics snapshot.

Zero `idx_scan` alone is therefore **not sufficient evidence** to delete an index. Small relations are commonly cheaper to sequential-scan, and many search indexes were introduced only in the recent Stage 7/11 rollout.

## Indexes retained intentionally

The trigram GIN indexes for students, teachers, documents, report cards, and payments remain. The frontend actively issues substring `ILIKE '%...%'` searches that these indexes are intended to support as the dataset grows.

Foreign-key/audit/payment indexes with zero scans are also retained when their tables are empty/new or when they protect expected write/delete paths.

`report_cards_student_idx` is retained even though `report_cards_student_id_academic_year_semester_key` has the same leading column, because production statistics already show 4 scans on the single-column index.

## Safe structural cleanup

Two single-column btree indexes are redundant with UNIQUE btree indexes that have the exact same leading column:

1. `school_classes_academic_year_id_idx (academic_year_id)`
   - covered by `school_classes_academic_year_name_key (academic_year_id, name)`
   - production scans: 0

2. `school_schedules_class_id_idx (class_id)`
   - covered by `school_schedules_class_slot_key (class_id, day_of_week, start_time)`
   - production scans: 0

The production migration `20260918053616_stage12_3_redundant_index_cleanup` removes only these two indexes. The covering UNIQUE indexes remain available for equality lookups on their leading columns and for referential-integrity related access paths. After applying it, Supabase Performance Advisor decreased from 46 to 44 unused-index findings.

## Decision rule for later cleanup

Do not remove another index solely because Supabase labels it unused. Require at least:

- a meaningful observation window,
- sufficient table cardinality for the planner to prefer indexes when appropriate,
- no current product query or RLS/function dependency needing the access path,
- no unique/constraint responsibility,
- no FK/delete/update support concern,
- and either structural duplication or query-plan evidence proving it unnecessary.
