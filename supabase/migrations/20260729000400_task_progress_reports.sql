-- Bao cao tien do cong viec (progress report) kem file dinh kem va lien ket ngoai.
-- Man hinh: Quan ly cong viec > Danh sach cong viec > nut "Bao cao".

create table if not exists public.bao_cao_cong_viec (
  id uuid primary key default gen_random_uuid(),
  cong_viec_id uuid not null references public.cong_viec(id) on delete cascade,
  nguoi_bao_cao_id uuid references public.tai_khoan(id) on delete set null,
  noi_dung text not null check (length(btrim(noi_dung)) > 0),
  tien_do smallint not null default 0 check (tien_do between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Anh tien do va file tai lieu dinh kem, luu tren Supabase Storage bucket "bao-cao".
create table if not exists public.bao_cao_dinh_kem (
  id uuid primary key default gen_random_uuid(),
  bao_cao_id uuid not null references public.bao_cao_cong_viec(id) on delete cascade,
  loai text not null check (loai in ('image', 'file')),
  ten_file text not null,
  duong_dan text not null,
  kieu_file text,
  kich_thuoc bigint check (kich_thuoc is null or kich_thuoc >= 0),
  created_at timestamptz not null default now()
);

-- Lien ket ngoai (Figma, Github, Google Doc...).
create table if not exists public.bao_cao_lien_ket (
  id uuid primary key default gen_random_uuid(),
  bao_cao_id uuid not null references public.bao_cao_cong_viec(id) on delete cascade,
  nhan text,
  duong_dan text not null,
  created_at timestamptz not null default now()
);

create index if not exists bao_cao_cong_viec_cong_viec_idx
  on public.bao_cao_cong_viec(cong_viec_id, created_at desc);
create index if not exists bao_cao_cong_viec_nguoi_bao_cao_idx
  on public.bao_cao_cong_viec(nguoi_bao_cao_id);
create index if not exists bao_cao_dinh_kem_bao_cao_idx
  on public.bao_cao_dinh_kem(bao_cao_id);
create index if not exists bao_cao_lien_ket_bao_cao_idx
  on public.bao_cao_lien_ket(bao_cao_id);

drop trigger if exists set_bao_cao_cong_viec_updated_at on public.bao_cao_cong_viec;
create trigger set_bao_cao_cong_viec_updated_at
before update on public.bao_cao_cong_viec
for each row execute function public.set_updated_at();

alter table public.bao_cao_cong_viec enable row level security;
alter table public.bao_cao_dinh_kem enable row level security;
alter table public.bao_cao_lien_ket enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'bao_cao_cong_viec',
    'bao_cao_dinh_kem',
    'bao_cao_lien_ket'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_select_authenticated',
      table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      table_name || '_select_authenticated',
      table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_insert_authenticated',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true)',
      table_name || '_insert_authenticated',
      table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_update_authenticated',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true)',
      table_name || '_update_authenticated',
      table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_delete_authenticated',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (true)',
      table_name || '_delete_authenticated',
      table_name
    );

    -- Quyen tam thoi cho giai doan phat trien chua co man hinh dang nhap,
    -- dong bo voi migration 20260729000300_dev_anon_project_api.sql.
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_all_anon_dev',
      table_name
    );
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      table_name || '_all_anon_dev',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete on table
  public.bao_cao_cong_viec,
  public.bao_cao_dinh_kem,
  public.bao_cao_lien_ket
to authenticated;

grant select, insert, update, delete on table
  public.bao_cao_cong_viec,
  public.bao_cao_dinh_kem,
  public.bao_cao_lien_ket
to anon;

-- Bucket luu anh tien do va file dinh kem cua bao cao.
insert into storage.buckets (id, name, public, file_size_limit)
values ('bao-cao', 'bao-cao', true, 10485760)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "bao_cao_storage_select" on storage.objects;
create policy "bao_cao_storage_select"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'bao-cao');

drop policy if exists "bao_cao_storage_insert" on storage.objects;
create policy "bao_cao_storage_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'bao-cao');

drop policy if exists "bao_cao_storage_delete" on storage.objects;
create policy "bao_cao_storage_delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'bao-cao');

comment on table public.bao_cao_cong_viec is
  'Bao cao tien do cua cong viec; moi ban ghi luu snapshot tien do tai thoi diem bao cao.';
comment on table public.bao_cao_dinh_kem is
  'Anh tien do va file tai lieu dinh kem cua bao cao; duong_dan tro toi bucket storage "bao-cao".';
comment on table public.bao_cao_lien_ket is
  'Lien ket ngoai cua bao cao (Figma, Github, Google Doc...).';
