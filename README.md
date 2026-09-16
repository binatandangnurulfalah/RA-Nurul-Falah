# RA Nurul Falah

Web app untuk RA (Raudhatul Athfal) Nurul Falah.

## Status saat ini

Fondasi autentikasi telah disiapkan:

- Login email + password
- Role `admin`, `teacher`, `parent`
- Tidak ada halaman registrasi publik
- Signup database dikunci menggunakan allowlist server
- Profil pengguna tersimpan di `public.user_profiles`
- Row Level Security aktif
- Routing dashboard berdasarkan role
- Akun nonaktif ditolak
- Lupa password dengan alur kode OTP 6 digit
- Buat password baru
- Logout
- Edge Function `admin-create-user` untuk pembuatan akun oleh admin

## Supabase

Project ref: `mtfeuozwxwayzcjltaak`

Client menggunakan publishable key. Secret/service-role key tidak disimpan di repository.

## Menjalankan lokal

```bash
npm install
npm run dev
```

## Catatan keamanan

Akun Auth hanya boleh dibuat jika email sebelumnya tersedia pada tabel `account_allowlist`. Pembuatan akun normal dilakukan melalui Edge Function admin sehingga role tidak dapat dipilih oleh pengguna dari browser.

Untuk produksi, email template OTP Supabase perlu menggunakan variabel `{{ .Token }}` agar email lupa-password menampilkan kode 6 digit, bukan magic link. Custom SMTP disarankan sebelum produksi.
