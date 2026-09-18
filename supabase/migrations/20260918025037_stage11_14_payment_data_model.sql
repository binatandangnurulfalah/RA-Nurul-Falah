begin;

alter table public.student_payments
  add column if not exists is_waived boolean not null default false;

update public.student_payments
set is_waived = (status = 'waived')
where is_waived is distinct from (status = 'waived');

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.student_payments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text not null default 'cash'
    check (method in ('cash','bank_transfer','qris','other','legacy')),
  reference_no text,
  notes text,
  created_by uuid references public.user_profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.user_profiles(id) on delete set null,
  void_reason text,
  constraint payment_transactions_reference_no_check
    check (reference_no is null or char_length(reference_no) between 1 and 120),
  constraint payment_transactions_notes_check
    check (notes is null or char_length(notes) <= 2000),
  constraint payment_transactions_void_consistency
    check (
      (voided_at is null and voided_by is null and void_reason is null)
      or (
        voided_at is not null
        and voided_by is not null
        and char_length(btrim(coalesce(void_reason, ''))) >= 3
      )
    )
);

create index if not exists payment_transactions_payment_idx
  on public.payment_transactions(payment_id, paid_at desc);

create index if not exists payment_transactions_active_idx
  on public.payment_transactions(payment_id, paid_at desc)
  where voided_at is null;

alter table public.payment_transactions enable row level security;

drop policy if exists "payment transaction access" on public.payment_transactions;
create policy "payment transaction access"
on public.payment_transactions
for select
to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or exists (
    select 1
    from public.student_payments charge
    join public.student_guardians guardian
      on guardian.student_id = charge.student_id
    where charge.id = payment_transactions.payment_id
      and guardian.guardian_user_id = (select auth.uid())
  )
);

grant select on table public.payment_transactions to authenticated;
revoke insert, update, delete on table public.payment_transactions from authenticated, anon;

drop policy if exists "admin create payments" on public.student_payments;
drop policy if exists "admin update payments" on public.student_payments;
drop policy if exists "admin delete payments" on public.student_payments;
revoke insert, update, delete on table public.student_payments from authenticated, anon;

insert into public.payment_transactions (
  payment_id,
  amount,
  paid_at,
  method,
  notes,
  created_by,
  created_at
)
select
  payment.id,
  payment.paid_amount,
  coalesce(payment.paid_at, payment.updated_at, payment.created_at),
  'legacy',
  'Migrasi saldo pembayaran legacy.',
  payment.created_by,
  coalesce(payment.paid_at, payment.updated_at, payment.created_at)
from public.student_payments payment
where payment.paid_amount > 0
  and not exists (
    select 1
    from public.payment_transactions transaction
    where transaction.payment_id = payment.id
      and transaction.method = 'legacy'
  );

create or replace function private.recalculate_student_payment(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric(12,2);
  v_is_waived boolean;
  v_paid numeric(12,2);
  v_paid_at timestamptz;
begin
  select payment.amount, payment.is_waived
    into v_amount, v_is_waived
  from public.student_payments payment
  where payment.id = p_payment_id
  for update;

  if not found then
    return;
  end if;

  select
    coalesce(sum(transaction.amount), 0)::numeric(12,2),
    max(transaction.paid_at)
    into v_paid, v_paid_at
  from public.payment_transactions transaction
  where transaction.payment_id = p_payment_id
    and transaction.voided_at is null;

  if v_paid > v_amount then
    raise exception 'Total transaksi pembayaran melebihi nominal tagihan.'
      using errcode = '23514';
  end if;

  update public.student_payments
  set
    paid_amount = v_paid,
    paid_at = v_paid_at,
    status = case
      when v_is_waived then 'waived'
      when v_paid = 0 then 'unpaid'
      when v_paid < v_amount then 'partial'
      when v_amount > 0 and v_paid = v_amount then 'paid'
      else 'unpaid'
    end
  where id = p_payment_id;
end;
$$;

revoke all on function private.recalculate_student_payment(uuid)
  from public, anon, authenticated;

create or replace function private.enforce_payment_transaction_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge_amount numeric(12,2);
  v_is_waived boolean;
  v_existing numeric(12,2);
begin
  select payment.amount, payment.is_waived
    into v_charge_amount, v_is_waived
  from public.student_payments payment
  where payment.id = new.payment_id
  for update;

  if not found then
    raise exception 'Tagihan tidak ditemukan.' using errcode = '23503';
  end if;

  if new.voided_at is null and v_is_waived then
    raise exception 'Tagihan yang dibebaskan tidak dapat menerima transaksi pembayaran.'
      using errcode = '23514';
  end if;

  if new.voided_at is null then
    select coalesce(sum(transaction.amount), 0)::numeric(12,2)
      into v_existing
    from public.payment_transactions transaction
    where transaction.payment_id = new.payment_id
      and transaction.voided_at is null
      and transaction.id is distinct from new.id;

    if v_existing + new.amount > v_charge_amount then
      raise exception 'Nominal pembayaran melebihi sisa tagihan.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_payment_transaction_balance()
  from public, anon, authenticated;

drop trigger if exists payment_transactions_enforce_balance on public.payment_transactions;
create trigger payment_transactions_enforce_balance
before insert or update of payment_id, amount, voided_at
on public.payment_transactions
for each row execute function private.enforce_payment_transaction_balance();

create or replace function private.refresh_payment_transaction_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.recalculate_student_payment(old.payment_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.payment_id is distinct from new.payment_id then
    perform private.recalculate_student_payment(old.payment_id);
  end if;

  perform private.recalculate_student_payment(new.payment_id);
  return new;
end;
$$;

revoke all on function private.refresh_payment_transaction_charge()
  from public, anon, authenticated;

drop trigger if exists payment_transactions_refresh_charge on public.payment_transactions;
create trigger payment_transactions_refresh_charge
after insert or update or delete
on public.payment_transactions
for each row execute function private.refresh_payment_transaction_charge();

create or replace function public.save_student_charge(
  p_payment_id uuid,
  p_student_id uuid,
  p_payment_type text,
  p_period_label text,
  p_amount numeric,
  p_due_date date,
  p_is_waived boolean,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_payment_type text := btrim(coalesce(p_payment_type, ''));
  v_period_label text := nullif(btrim(coalesce(p_period_label, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_paid numeric(12,2) := 0;
begin
  if v_actor is null
     or (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat mengelola tagihan.'
      using errcode = '42501';
  end if;

  if p_student_id is null or not exists (
    select 1 from public.students student where student.id = p_student_id
  ) then
    raise exception 'Murid tidak valid.' using errcode = '23503';
  end if;

  if char_length(v_payment_type) not between 2 and 100 then
    raise exception 'Jenis pembayaran wajib diisi 2-100 karakter.'
      using errcode = '22023';
  end if;

  if v_period_label is not null and char_length(v_period_label) > 120 then
    raise exception 'Periode pembayaran maksimal 120 karakter.'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount < 0 or p_amount >= 10000000000 then
    raise exception 'Nominal tagihan tidak valid.'
      using errcode = '22023';
  end if;

  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'Catatan maksimal 2000 karakter.'
      using errcode = '22023';
  end if;

  if p_payment_id is null then
    insert into public.student_payments (
      student_id,
      payment_type,
      period_label,
      amount,
      paid_amount,
      due_date,
      paid_at,
      status,
      is_waived,
      notes,
      created_by
    ) values (
      p_student_id,
      v_payment_type,
      v_period_label,
      p_amount,
      0,
      p_due_date,
      null,
      case when coalesce(p_is_waived, false) then 'waived' else 'unpaid' end,
      coalesce(p_is_waived, false),
      v_notes,
      v_actor
    )
    returning id into v_id;
  else
    select coalesce(sum(transaction.amount), 0)::numeric(12,2)
      into v_paid
    from public.payment_transactions transaction
    where transaction.payment_id = p_payment_id
      and transaction.voided_at is null;

    if not exists (
      select 1 from public.student_payments payment where payment.id = p_payment_id
    ) then
      raise exception 'Tagihan tidak ditemukan.' using errcode = 'P0002';
    end if;

    if p_amount < v_paid then
      raise exception 'Nominal tagihan tidak boleh lebih kecil dari pembayaran yang sudah diterima.'
        using errcode = '23514';
    end if;

    update public.student_payments
    set
      student_id = p_student_id,
      payment_type = v_payment_type,
      period_label = v_period_label,
      amount = p_amount,
      due_date = p_due_date,
      is_waived = coalesce(p_is_waived, false),
      notes = v_notes
    where id = p_payment_id
    returning id into v_id;

    perform private.recalculate_student_payment(v_id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_student_charge(
  uuid, uuid, text, text, numeric, date, boolean, text
) from public, anon;
grant execute on function public.save_student_charge(
  uuid, uuid, text, text, numeric, date, boolean, text
) to authenticated;

create or replace function public.record_payment_transaction(
  p_payment_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_method text,
  p_reference_no text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_charge_amount numeric(12,2);
  v_paid_amount numeric(12,2);
  v_is_waived boolean;
  v_method text := lower(btrim(coalesce(p_method, '')));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor is null
     or (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat mencatat pembayaran.'
      using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount >= 10000000000 then
    raise exception 'Nominal pembayaran harus lebih dari 0.'
      using errcode = '22023';
  end if;

  if v_method not in ('cash','bank_transfer','qris','other') then
    raise exception 'Metode pembayaran tidak valid.'
      using errcode = '22023';
  end if;

  if v_reference_no is not null and char_length(v_reference_no) > 120 then
    raise exception 'Nomor referensi maksimal 120 karakter.'
      using errcode = '22023';
  end if;

  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'Catatan maksimal 2000 karakter.'
      using errcode = '22023';
  end if;

  select payment.amount, payment.paid_amount, payment.is_waived
    into v_charge_amount, v_paid_amount, v_is_waived
  from public.student_payments payment
  where payment.id = p_payment_id
  for update;

  if not found then
    raise exception 'Tagihan tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_is_waived then
    raise exception 'Tagihan yang dibebaskan tidak dapat menerima pembayaran.'
      using errcode = '23514';
  end if;

  if p_amount > greatest(v_charge_amount - v_paid_amount, 0) then
    raise exception 'Nominal pembayaran melebihi sisa tagihan.'
      using errcode = '23514';
  end if;

  insert into public.payment_transactions (
    payment_id,
    amount,
    paid_at,
    method,
    reference_no,
    notes,
    created_by
  ) values (
    p_payment_id,
    p_amount,
    coalesce(p_paid_at, now()),
    v_method,
    v_reference_no,
    v_notes,
    v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_payment_transaction(
  uuid, numeric, timestamptz, text, text, text
) from public, anon;
grant execute on function public.record_payment_transaction(
  uuid, numeric, timestamptz, text, text, text
) to authenticated;

create or replace function public.void_payment_transaction(
  p_transaction_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if v_actor is null
     or (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat membatalkan transaksi.'
      using errcode = '42501';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Alasan pembatalan wajib diisi 3-500 karakter.'
      using errcode = '22023';
  end if;

  update public.payment_transactions
  set
    voided_at = now(),
    voided_by = v_actor,
    void_reason = v_reason
  where id = p_transaction_id
    and voided_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.'
      using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke all on function public.void_payment_transaction(uuid, text)
  from public, anon;
grant execute on function public.void_payment_transaction(uuid, text)
  to authenticated;

create or replace function public.delete_student_charge(
  p_payment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null
     or (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat menghapus tagihan.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.payment_transactions transaction
    where transaction.payment_id = p_payment_id
  ) then
    raise exception 'Tagihan yang memiliki riwayat transaksi tidak dapat dihapus.'
      using errcode = '23503';
  end if;

  delete from public.student_payments
  where id = p_payment_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Tagihan tidak ditemukan.' using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke all on function public.delete_student_charge(uuid) from public, anon;
grant execute on function public.delete_student_charge(uuid) to authenticated;

do $$
declare
  payment record;
begin
  for payment in select id from public.student_payments loop
    perform private.recalculate_student_payment(payment.id);
  end loop;
end;
$$;

alter table public.audit_events
  drop constraint if exists audit_events_table_name_check;
alter table public.audit_events
  add constraint audit_events_table_name_check check (
    table_name in (
      'academic_years',
      'announcements',
      'attendance_records',
      'school_classes',
      'school_documents',
      'school_settings',
      'student_guardians',
      'student_payments',
      'payment_transactions',
      'students',
      'teacher_class_assignments',
      'teacher_profiles',
      'report_cards',
      'account_management'
    )
  ) not valid;
alter table public.audit_events validate constraint audit_events_table_name_check;

create or replace function private.audit_sanitize_payload(
  p_table_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb)
    - array[
      'password','new_password','access_token','refresh_token','jwt',
      'service_role_key','anon_key','token','qr_token','created_at','updated_at'
    ];
begin
  case p_table_name
    when 'students' then
      v_payload := v_payload - array['nik','birth_place','birth_date'];
    when 'teacher_profiles' then
      v_payload := v_payload - array['nik','birth_place','birth_date','notes'];
    when 'report_cards' then
      v_payload := v_payload - array[
        'religion_character','identity_independence','literacy_steam',
        'growth_notes','teacher_note'
      ];
    when 'student_payments' then
      v_payload := v_payload - array['notes'];
    when 'payment_transactions' then
      v_payload := v_payload - array['notes','reference_no'];
    when 'school_documents' then
      v_payload := v_payload - array[
        'file_url','storage_path','external_url','original_file_name','description'
      ];
    when 'announcements' then
      v_payload := v_payload - array['body'];
    when 'school_settings' then
      v_payload := v_payload - array['address','email','phone'];
    else
      null;
  end case;
  return v_payload;
end;
$$;

revoke all on function private.audit_sanitize_payload(text, jsonb)
  from public, anon, authenticated;

drop trigger if exists payment_transactions_capture_audit on public.payment_transactions;
create trigger payment_transactions_capture_audit
after insert or update or delete on public.payment_transactions
for each row execute function private.capture_audit_event();

commit;
