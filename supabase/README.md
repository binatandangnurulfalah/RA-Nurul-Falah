# Supabase schema source of truth

Folder `supabase/migrations/` mencerminkan migration history yang benar-benar tercatat pada Supabase produksi `mtfeuozwxwayzcjltaak` per 17 September 2026.

## Aturan utama

- Jangan mengganti timestamp atau nama migration yang sudah ada.
- Jangan mengedit migration lama setelah diterapkan ke produksi. Perubahan schema baru harus dibuat sebagai migration baru.
- `supabase/migrations/` hanya berisi migration yang tercatat di `supabase_migrations.schema_migrations` produksi.
- Script yang pernah diterapkan manual di luar migration history disimpan di `supabase/bootstrap/` dan tidak boleh dipindahkan kembali ke `supabase/migrations/` tanpa migration repair yang disengaja.

## DDL historis yang tidak tercatat di migration history

Empat script berikut aktif pada schema produksi tetapi dulunya diterapkan di luar mekanisme migration Supabase:

1. `bootstrap/20260916035026_add_students_and_attendance.sql`
2. `bootstrap/20260916040102_add_weekly_school_schedules.sql`
3. `bootstrap/20260916144500_support_unlinked_teacher_records.sql`
4. `bootstrap/20260916150500_deduplicate_teacher_profile_policies.sql`

## Urutan restore database baru

Untuk disaster recovery / membuat database kosong yang setara dengan histori proyek, jalankan dalam urutan berikut:

1. Migration produksi `20260916024441` sampai `20260916030226`.
2. Jalankan bootstrap `20260916035026_add_students_and_attendance.sql`.
3. Jalankan bootstrap `20260916040102_add_weekly_school_schedules.sql`.
4. Lanjutkan migration produksi `20260916080135` sampai `20260916103158`.
5. Jalankan bootstrap `20260916144500_support_unlinked_teacher_records.sql`.
6. Jalankan bootstrap `20260916150500_deduplicate_teacher_profile_policies.sql`.
7. Lanjutkan migration produksi mulai `20260916153134` sampai migration terbaru.

Bootstrap tidak dijalankan oleh `supabase db push`; file tersebut hanya untuk restore database kosong dan dokumentasi sejarah schema.

## Validasi

`production-migration-manifest.json` adalah daftar migration yang diharapkan. Automated test membandingkan isi folder migration dengan manifest agar timestamp/nama tidak kembali drift.
