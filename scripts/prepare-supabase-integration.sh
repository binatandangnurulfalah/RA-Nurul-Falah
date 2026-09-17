#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
bootstrap_dir="$repo_root/supabase/bootstrap"

# These four files predate the tracked production migration history. Materialize
# them only in the disposable CI checkout so a clean local stack can replay the
# same dependency order without rewriting production's migration ledger.
cp "$bootstrap_dir/20260916035026_add_students_and_attendance.sql" \
  "$migrations_dir/20260916035026_add_students_and_attendance.sql"

# The historical schedule migration also contained demo rows tied to one
# production-only auth UUID. The schema/policies belong in a clean rebuild; the
# demo data does not.
sed '/^insert into public\.school_schedules/,$d' \
  "$bootstrap_dir/20260916040102_add_weekly_school_schedules.sql" \
  > "$migrations_dir/20260916040102_add_weekly_school_schedules.sql"

cp "$bootstrap_dir/20260916144500_support_unlinked_teacher_records.sql" \
  "$migrations_dir/20260916144500_support_unlinked_teacher_records.sql"
cp "$bootstrap_dir/20260916150500_deduplicate_teacher_profile_policies.sql" \
  "$migrations_dir/20260916150500_deduplicate_teacher_profile_policies.sql"
