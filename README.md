# RA Nurul Falah

Aplikasi web manajemen RA (Raudhatul Athfal) Nurul Falah untuk Admin, Guru, dan Orang Tua/Wali.

## Fitur aktif

- Login email + password dengan role `admin`, `teacher`, dan `parent`
- Tidak ada registrasi publik
- Admin membuat akun dengan Nama, Email, dan Role; pengguna menentukan password sendiri melalui alur recovery/invitation
- MFA TOTP diwajibkan pada portal Administrator
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
- `html5-qrcode` untuk pemindaian QR live-camera
- `qrcode.react` untuk pembuatan QR murid

## Supabase

Project ref: `mtfeuozwxwayzcjltaak`

Frontend hanya menggunakan publishable/anon key. Secret/service-role key tidak disimpan atau digunakan di frontend.

Edge Function aktif yang menjadi source of truth di repository:

- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-manage-user/index.ts`
- `supabase/functions/record-attendance/index.ts`
- `supabase/functions/manage-attendance-record/index.ts`

`delete-attendance-record` telah dipensiunkan. Semua create/update/delete absensi manual menggunakan `manage-attendance-record`.

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
- Portal Admin menggunakan MFA TOTP.

### Leaked Password Protection

Supabase Security Advisor dapat menampilkan warning `Leaked Password Protection Disabled`. Project production saat ini berada pada Supabase Free plan, sedangkan fitur tersebut memerlukan Pro plan atau lebih tinggi. Jangan menganggap warning ini sudah terselesaikan tanpa upgrade plan yang disetujui. Mitigasi saat ini adalah kebijakan password kuat, user-owned password setup/recovery, dan MFA TOTP untuk Admin.

## MFA Administrator dan recovery

Admin yang belum memiliki faktor TOTP akan diminta mengaktifkan authenticator sebelum portal Admin dibuka. Admin yang sudah memiliki faktor TOTP harus menyelesaikan challenge sampai session mencapai `aal2`.

Supabase Auth tidak menyediakan recovery code TOTP. Karena itu prosedur operasionalnya:

1. Setiap Administrator harus mendaftarkan faktor TOTP cadangan pada perangkat/aplikasi authenticator yang berbeda jika tersedia.
2. Secret/faktor cadangan harus disimpan terpisah dari perangkat utama dan tidak dimasukkan ke source code, database aplikasi, log, atau tiket dukungan.
3. Jika faktor utama hilang tetapi faktor cadangan masih tersedia, login memakai faktor cadangan lalu kelola faktor yang tidak lagi digunakan.
4. Jika seluruh faktor hilang, jangan membuat bypass MFA di frontend atau melemahkan RLS. Recovery harus dilakukan oleh operator Supabase yang berwenang mengikuti prosedur Auth project, kemudian MFA didaftarkan ulang.

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
  AdminMfaGate.tsx
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
