# RA Nurul Falah

Aplikasi web manajemen RA (Raudhatul Athfal) Nurul Falah untuk Admin, Guru, dan Orang Tua/Wali.

## Fitur aktif

- Login email + password dengan role `admin`, `teacher`, dan `parent`
- Tidak ada registrasi publik
- Admin membuat akun dengan Nama, Email, dan Role; pengguna menentukan password sendiri melalui alur recovery/invitation
- Portal internal tidak menggunakan MFA/TOTP; seluruh role masuk cukup dengan email + password
- Profil pengguna dan status aktif tersimpan di `public.user_profiles`
- Row Level Security (RLS) membatasi data sesuai role dan relasi wali murid
- Lupa password menggunakan OTP/recovery Supabase Auth
- Data murid dan relasi wali murid
- QR unik setiap murid
- Scan absensi **LIVE CAMERA ONLY**; tidak tersedia upload foto, galeri, scan gambar, torch, lampu, atau flash
- Scanner mendukung pergantian kamera; preview kamera depan dimirror tanpa memirror frame detector
- Riwayat kehadiran dan status terlambat
- Jadwal mingguan Kelompok A dan B
- Portal responsif untuk Admin, Guru, dan Orang Tua/Wali
- Deploy otomatis ke GitHub Pages melalui GitHub Actions

## Stack

- React 19
- TypeScript
- Vite
- React Router dengan `HashRouter`
- Supabase Auth, Postgres, RLS, Storage, dan Edge Functions
- Native browser `BarcodeDetector` + `getUserMedia` untuk pemindaian QR live-camera
- `qrcode.react` untuk pembuatan QR murid

## Supabase

Project ref: `mtfeuozwxwayzcjltaak`

Frontend hanya menggunakan publishable/anon key. Secret/service-role key tidak disimpan atau digunakan di frontend.

Edge Function aktif yang menjadi source of truth di repository:

- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-manage-user/index.ts`
- `supabase/functions/record-attendance/index.ts`
- `supabase/functions/manage-attendance-record/index.ts`
- `supabase/functions/process-document-storage-cleanup/index.ts`

`delete-attendance-record` telah dipensiunkan sebagai endpoint mutasi. Production mempertahankan tombstone kompatibilitas yang selalu mengembalikan HTTP `410`; source tombstone disimpan di `supabase/functions/delete-attendance-record/index.ts`. Semua create/update/delete absensi manual menggunakan `manage-attendance-record`.

Shared helper Edge Function tersimpan di `supabase/functions/_shared/`. Supabase JS untuk Edge Function dipin pada satu versi melalui `_shared/auth.ts`.

Migration database tersimpan di `supabase/migrations/`. Perubahan production wajib melalui migration dan tidak boleh mengubah data produksi secara destruktif.

## Tahap 11A — Backend hardening

Hardening yang diterapkan:

- Checkout attendance memakai conditional update dan memverifikasi row yang benar-benar berubah; concurrent checkout kedua mendapat HTTP `409`.
- Aktor attendance dipisahkan menjadi `recorded_by`, `check_in_by`, `check_out_by`, dan `last_corrected_by`.
- Koreksi manual menyimpan `correction_reason` dan `last_corrected_at`.
- Authorization Edge Function dipusatkan melalui helper shared.
- Akun baru tidak lagi memakai password yang dipilih atau diketahui Admin.
- Password aplikasi minimal 10 karakter dan wajib menggunakan minimal 3 kelompok karakter.
- Admin tetap dibatasi oleh role, status akun aktif, RLS, dan authorization Edge Function tanpa mewajibkan MFA.

### Leaked Password Protection

Supabase Security Advisor dapat menampilkan warning `Leaked Password Protection Disabled`. Project production saat ini berada pada Supabase Free plan, sedangkan fitur tersebut memerlukan Pro plan atau lebih tinggi. Jangan menganggap warning ini sudah terselesaikan tanpa upgrade plan yang disetujui. Mitigasi saat ini adalah kebijakan password kuat, user-owned password setup/recovery, RLS, role-based authorization, dan akun internal tanpa registrasi publik.

## Login dan recovery

Aplikasi ini digunakan sebagai sistem internal. Login normal untuk Admin, Guru, dan Orang Tua/Wali cukup menggunakan email dan password. Tidak ada langkah authenticator, QR MFA, TOTP, atau kewajiban session `aal2`.

Jika pengguna lupa password, alur recovery email/OTP Supabase Auth tetap tersedia. MFA factor yang mungkin pernah terdaftar pada akun lama tidak digunakan oleh aplikasi dan tidak menjadi syarat untuk membuka portal atau menjalankan Edge Function.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Unit/regression test:

```bash
npm run test
```

Integration test Supabase dijalankan terhadap environment testing/lokal, bukan production:

```bash
npm run test:integration
```

Build produksi sekaligus pemeriksaan TypeScript:

```bash
npm run build
```

Pemeriksaan gabungan:

```bash
npm run check
```

Konfigurasi TypeScript mengaktifkan `noUnusedLocals` dan `noUnusedParameters`, sehingga import, variabel, parameter, atau fungsi mati akan terdeteksi saat build.

## Struktur utama

```text
src/
  App.tsx
  RolePortal.tsx
  lib/
  portal-v2/
supabase/
  functions/
    _shared/
  migrations/
tests/
  integration/
```

## Catatan keamanan

- Role pengguna tidak dipilih melalui signup publik.
- Data anak dan kehadiran wali murid dibatasi RLS berdasarkan `student_guardians`.
- Pencatatan absensi QR dilakukan melalui `record-attendance` dan hanya menerima Admin/Guru aktif yang berwenang.
- Service-role hanya boleh digunakan di environment server/Edge Function, tidak di bundle frontend.
- Password, JWT, session, service-role key, dan isi dokumen sensitif tidak boleh dimasukkan ke audit log.
- Bucket `school-documents` harus tetap private; akses file menggunakan signed URL sesuai authorization.
- Custom SMTP direkomendasikan untuk pengiriman email produksi.


## Tahap 11.18 — Final Production Audit

Checklist final menjaga repository dan production tetap sinkron:

- seluruh migration production harus memiliki file dengan version/name yang sama di `supabase/migrations/`;
- `src/lib/database.types.ts` diregenerasi dari schema production, sedangkan `database-normalized.types.ts` hanya mempertahankan override kontrak TypeScript yang memang diperlukan frontend;
- Edge Function production harus cocok dengan source repository; endpoint lama `delete-attendance-record` hanya boleh berupa tombstone HTTP `410`;
- bucket `school-documents` tetap private dan akses file dikendalikan policy/signed URL;
- tabel internal-only seperti `announcement_reads` dan queue cleanup tidak memberi akses langsung ke `anon`/`authenticated`;
- RPC `SECURITY DEFINER` yang diekspos ke pengguna terautentikasi wajib memiliki pemeriksaan session/role di dalam fungsi. Warning Advisor untuk pola ini ditinjau sebagai intentional, bukan diabaikan;
- warning `Leaked Password Protection Disabled` tetap merupakan batasan plan yang sudah dijelaskan di atas;
- Performance Advisor foreign-key index ditangani dengan index non-destruktif; warning unused-index tidak dijadikan alasan menghapus index pada project baru tanpa data penggunaan yang cukup;
- scanner wajib tetap **LIVE CAMERA ONLY** tanpa upload/galeri/manual/torch, dengan pergantian kamera tetap tersedia;
- final gate mencakup unit/regression, integration security, TypeScript/build, Playwright desktop/mobile, PWA artifact verification, dan deploy GitHub Pages.
