# RA Nurul Falah

Aplikasi web manajemen RA (Raudhatul Athfal) Nurul Falah untuk Admin, Guru, dan Orang Tua/Wali.

## Fitur aktif

- Login email + password dengan role `admin`, `teacher`, dan `parent`
- Tidak ada registrasi publik
- Akun dibuat Admin melalui Edge Function `admin-create-user`
- Profil pengguna dan status aktif tersimpan di `public.user_profiles`
- Row Level Security (RLS) untuk membatasi data sesuai role dan relasi wali murid
- Lupa password menggunakan OTP 6 digit
- Data murid dan relasi wali murid
- QR unik setiap murid
- Scan absensi masuk/pulang melalui kamera atau kode manual
- Riwayat kehadiran dan status terlambat
- Jadwal mingguan Kelompok A dan B
- Portal responsif untuk Admin, Guru, dan Orang Tua/Wali
- Deploy otomatis ke GitHub Pages melalui GitHub Actions

## Stack

- React 19
- TypeScript
- Vite
- React Router
- Supabase Auth, Postgres, RLS, dan Edge Functions
- `html5-qrcode` untuk pemindaian QR
- `qrcode.react` untuk pembuatan QR murid

## Supabase

Project ref: `mtfeuozwxwayzcjltaak`

Frontend menggunakan publishable key. Secret/service-role key tidak disimpan di repository.

Source Edge Function yang aktif disimpan di:

- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/record-attendance/index.ts`

Migration database tersimpan di `supabase/migrations/`.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Build produksi sekaligus menjalankan pemeriksaan TypeScript:

```bash
npm run build
```

Konfigurasi TypeScript mengaktifkan `noUnusedLocals` dan `noUnusedParameters`, sehingga import, variabel, parameter, atau fungsi mati akan terdeteksi saat build.

## Struktur utama

```text
src/
  App.tsx              # autentikasi, recovery password, dan routing role
  RolePortal.tsx       # portal Admin/Guru/Orang Tua
  lib/supabase.ts      # client Supabase dan tipe profil
  styles.css           # tampilan autentikasi
  portal.css           # tampilan portal
supabase/
  functions/           # source Edge Functions
  migrations/          # migration database
```

## Catatan keamanan

- Pembuatan akun normal dilakukan melalui Edge Function Admin.
- Role pengguna tidak dipilih langsung dari browser saat signup.
- Data anak dan kehadiran wali murid dibatasi oleh RLS berdasarkan tabel `student_guardians`.
- Pencatatan absensi dilakukan melalui Edge Function `record-attendance` dan hanya menerima Admin/Guru yang aktif.
- Untuk produksi, template email OTP Supabase perlu menggunakan `{{ .Token }}` agar email lupa password menampilkan kode 6 digit, bukan magic link.
- Custom SMTP direkomendasikan untuk pengiriman email produksi.
