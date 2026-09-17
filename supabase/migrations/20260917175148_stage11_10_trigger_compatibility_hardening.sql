begin;

-- Avoid consulting OLD on INSERT paths and keep legacy cached clients safe while
-- normalized ID columns become authoritative.
create or replace function public.sync_school_class_academic_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year_id uuid;
  v_label text;
begin
  if tg_op = 'INSERT' then
    if new.academic_year_id is not null then
      select ay.id, ay.label into v_year_id, v_label
      from public.academic_years ay where ay.id = new.academic_year_id;
    else
      select ay.id, ay.label into v_year_id, v_label
      from public.academic_years ay where ay.label = nullif(btrim(new.academic_year), '');
    end if;
  elsif new.academic_year is distinct from old.academic_year
        and new.academic_year_id is not distinct from old.academic_year_id then
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay where ay.label = nullif(btrim(new.academic_year), '');
  elsif new.academic_year_id is not null then
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay where ay.id = new.academic_year_id;
  else
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay where ay.label = nullif(btrim(new.academic_year), '');
  end if;

  if v_year_id is null then
    raise exception 'Tahun ajaran tidak ditemukan.' using errcode = '23503';
  end if;

  new.academic_year_id := v_year_id;
  new.academic_year := v_label;
  return new;
end;
$$;

create or replace function public.sync_student_academic_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year_id uuid;
  v_year_label text;
  v_class_id uuid;
  v_class_name text;
  v_use_legacy boolean;
begin
  if tg_op = 'INSERT' then
    v_use_legacy := new.class_id is null;
  else
    v_use_legacy := new.class_id is not distinct from old.class_id
      and (
        new.class_name is distinct from old.class_name
        or new.academic_year is distinct from old.academic_year
      );
  end if;

  if v_use_legacy then
    if new.academic_year_id is not null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.id = new.academic_year_id;
    end if;

    if v_year_id is null and nullif(btrim(coalesce(new.academic_year, '')), '') is not null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.label = btrim(new.academic_year);
    end if;

    if v_year_id is null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.is_current = true and ay.is_active = true;
    end if;

    if nullif(btrim(coalesce(new.class_name, '')), '') is not null then
      select c.id, c.name into v_class_id, v_class_name
      from public.school_classes c
      where c.academic_year_id = v_year_id
        and c.name = btrim(new.class_name);
      if v_class_id is null then
        raise exception 'Kelas tidak ditemukan pada tahun ajaran yang dipilih.' using errcode = '23503';
      end if;
    end if;
  elsif new.class_id is not null then
    select c.id, c.name, ay.id, ay.label
      into v_class_id, v_class_name, v_year_id, v_year_label
    from public.school_classes c
    join public.academic_years ay on ay.id = c.academic_year_id
    where c.id = new.class_id;

    if v_class_id is null then
      raise exception 'Kelas tidak ditemukan.' using errcode = '23503';
    end if;
  else
    if new.academic_year_id is not null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.id = new.academic_year_id;
    end if;

    if v_year_id is null and nullif(btrim(coalesce(new.academic_year, '')), '') is not null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.label = btrim(new.academic_year);
    end if;

    if v_year_id is null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.is_current = true and ay.is_active = true;
    end if;
  end if;

  if v_year_id is null then
    raise exception 'Tahun ajaran aktif tidak ditemukan.' using errcode = '23503';
  end if;

  new.class_id := v_class_id;
  new.class_name := v_class_name;
  new.academic_year_id := v_year_id;
  new.academic_year := v_year_label;
  return new;
end;
$$;

create or replace function public.sync_schedule_academic_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_class_name text;
  v_year_id uuid;
  v_year_label text;
  v_use_legacy boolean;
begin
  if tg_op = 'INSERT' then
    v_use_legacy := new.class_id is null;
  else
    v_use_legacy := new.class_id is not distinct from old.class_id
      and (
        new.class_name is distinct from old.class_name
        or new.academic_year is distinct from old.academic_year
      );
  end if;

  if v_use_legacy then
    if new.academic_year_id is not null then
      v_year_id := new.academic_year_id;
    elsif nullif(btrim(coalesce(new.academic_year, '')), '') is not null then
      select ay.id into v_year_id
      from public.academic_years ay where ay.label = btrim(new.academic_year);
    end if;

    select c.id, c.name, ay.id, ay.label
      into v_class_id, v_class_name, v_year_id, v_year_label
    from public.school_classes c
    join public.academic_years ay on ay.id = c.academic_year_id
    where c.name = btrim(new.class_name)
      and c.academic_year_id = v_year_id;
  else
    select c.id, c.name, ay.id, ay.label
      into v_class_id, v_class_name, v_year_id, v_year_label
    from public.school_classes c
    join public.academic_years ay on ay.id = c.academic_year_id
    where c.id = new.class_id;
  end if;

  if v_class_id is null then
    raise exception 'Kelas jadwal tidak ditemukan.' using errcode = '23503';
  end if;

  new.class_id := v_class_id;
  new.class_name := v_class_name;
  new.academic_year_id := v_year_id;
  new.academic_year := v_year_label;
  return new;
end;
$$;

create or replace function public.sync_school_settings_academic_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year_id uuid;
  v_label text;
begin
  if tg_op = 'INSERT' then
    if new.academic_year_id is not null then
      select ay.id, ay.label into v_year_id, v_label
      from public.academic_years ay where ay.id = new.academic_year_id;
    else
      select ay.id, ay.label into v_year_id, v_label
      from public.academic_years ay where ay.label = nullif(btrim(new.academic_year), '');
    end if;
  elsif new.academic_year is distinct from old.academic_year
        and new.academic_year_id is not distinct from old.academic_year_id then
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay where ay.label = nullif(btrim(new.academic_year), '');
  else
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay where ay.id = new.academic_year_id;
  end if;

  if v_year_id is null then
    raise exception 'Tahun ajaran sekolah tidak ditemukan.' using errcode = '23503';
  end if;

  new.academic_year_id := v_year_id;
  new.academic_year := v_label;
  return new;
end;
$$;

revoke all on function public.sync_school_class_academic_refs() from public, anon, authenticated;
revoke all on function public.sync_student_academic_refs() from public, anon, authenticated;
revoke all on function public.sync_schedule_academic_refs() from public, anon, authenticated;
revoke all on function public.sync_school_settings_academic_refs() from public, anon, authenticated;

commit;
