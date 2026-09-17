create table public.school_schedules (
  id uuid primary key default gen_random_uuid(), class_name text not null,
  day_of_week smallint not null check (day_of_week between 1 and 5),
  start_time time not null, end_time time not null,
  activity text not null check (char_length(trim(activity)) between 2 and 120),
  teacher_name text, academic_year text not null default '2026/2027',
  is_active boolean not null default true, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(class_name,day_of_week,start_time,academic_year), check(end_time > start_time)
);
create index school_schedules_day_class_idx on public.school_schedules(day_of_week,class_name,start_time);
create index school_schedules_created_by_idx on public.school_schedules(created_by);
alter table public.school_schedules enable row level security;
create policy "role based schedule access" on public.school_schedules for select to authenticated using (
  (select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)
  or exists (select 1 from public.students s join public.student_guardians sg on sg.student_id=s.id where sg.guardian_user_id=(select auth.uid()) and s.class_name=school_schedules.class_name and s.is_active=true)
);
create policy "staff create schedules" on public.school_schedules for insert to authenticated with check ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role) and created_by=(select auth.uid()));
create policy "staff update schedules" on public.school_schedules for update to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)) with check ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "staff delete schedules" on public.school_schedules for delete to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
grant select,insert,update,delete on public.school_schedules to authenticated;

insert into public.school_schedules(class_name,day_of_week,start_time,end_time,activity,teacher_name,created_by)
select c.class_name,v.day_no,v.start_at::time,v.end_at::time,case when c.class_name='Kelompok A' then v.activity_a else v.activity_b end,case when c.class_name='Kelompok A' then 'Ibu Nur Aisyah' else 'Bapak Hasbi Himatudin' end,'8c6669e9-21c2-4509-a04f-9201b657d70c'
from (values ('Kelompok A'),('Kelompok B')) c(class_name)
cross join (values
(1,'07:30','08:00','Doa Pagi & Hafalan Surat Pendek','Doa Pagi & Hafalan Surat Pendek'),(1,'08:00','08:45','Motorik: Gerak dan Lagu','Membaca Iqra & Huruf Hijaiyah'),(1,'08:45','09:15','Mengenal Warna dan Bentuk','Kognitif: Angka 1–20'),(1,'09:15','09:45','Istirahat & Makan Sehat','Istirahat & Makan Sehat'),(1,'09:45','10:30','Kolase Bentuk Sederhana','Seni: Menggambar Lingkungan'),
(2,'07:30','08:00','Doa Pagi & Asmaul Husna','Doa Pagi & Asmaul Husna'),(2,'08:00','08:45','Bahasa: Cerita Bergambar','Bahasa: Bercerita Pengalaman'),(2,'08:45','09:15','Motorik Halus: Meronce','Sains: Mengenal Tumbuhan'),(2,'09:15','09:45','Istirahat & Makan Sehat','Istirahat & Makan Sehat'),(2,'09:45','10:30','Bermain Peran Keluarga','Praktik Menanam Bibit'),
(3,'07:30','08:00','Doa Pagi & Hafalan Hadis','Doa Pagi & Hafalan Hadis'),(3,'08:00','08:45','Mengenal Huruf A–F','Membaca Suku Kata'),(3,'08:45','09:15','Berhitung Benda 1–10','Matematika: Penjumlahan Dasar'),(3,'09:15','09:45','Istirahat & Makan Sehat','Istirahat & Makan Sehat'),(3,'09:45','10:30','Permainan Tradisional','Olahraga & Permainan Bola'),
(4,'07:30','08:00','Doa Pagi & Murojaah','Doa Pagi & Murojaah'),(4,'08:00','08:45','Eksperimen Air dan Warna','Sains: Terapung dan Tenggelam'),(4,'08:45','09:15','Bahasa Sunda Dasar','Bahasa Sunda & Budaya Lokal'),(4,'09:15','09:45','Istirahat & Makan Sehat','Istirahat & Makan Sehat'),(4,'09:45','10:30','Membuat Karya dari Kertas','Proyek Kreatif Barang Bekas'),
(5,'07:30','08:00','Salat Dhuha & Doa Bersama','Salat Dhuha & Doa Bersama'),(5,'08:00','08:45','Praktik Wudu','Praktik Salat Berjamaah'),(5,'08:45','09:15','Akhlak: Sopan dan Santun','Akhlak: Jujur dan Tanggung Jawab'),(5,'09:15','09:45','Istirahat & Makan Sehat','Istirahat & Makan Sehat'),(5,'09:45','10:30','Senam Ceria & Evaluasi Pekan','Jumat Bersih & Evaluasi Pekan')
) v(day_no,start_at,end_at,activity_a,activity_b);
