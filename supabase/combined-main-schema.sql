-- ===== 20260729000100_initial_schema.sql =====
-- Goal App - schema quan ly nhan su va cong viec
-- Nguon cot: E:\PM QLDA\sampleData.xlsx
--
-- Luu y:
-- - Workbook chi co tieu de, khong co dong du lieu de seed.
-- - Khong luu cot "password" tu Excel. Mat khau phai do Supabase Auth quan ly.
-- - Cac policy chi cho phep nguoi dung da dang nhap truy cap du lieu.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.phong_ban (
  id uuid primary key default gen_random_uuid(),
  ma_pb text not null unique,
  ten_pb text not null,
  phong_ban_cha_id uuid references public.phong_ban(id) on delete set null,
  cap_do smallint not null default 1 check (cap_do > 0),
  chuc_vu text[] not null default '{}',
  mo_ta text,
  trang_thai_cv text not null default 'active'
    check (trang_thai_cv in ('active', 'inactive')),
  ngay_tao timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tai_khoan (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  ma_nv text not null unique,
  ten_nv text not null,
  sdt text,
  dia_chi text,
  avatar_url text,
  ngay_sinh date,
  ngay_vao_lam date,
  ngay_nghi_viec date,
  so_tai_khoan text,
  ten_ngan_hang text,
  ghi_chu text,
  username text unique,
  email text,
  phong_ban_id uuid references public.phong_ban(id) on delete set null,
  chuc_vu text,
  role text not null default 'member'
    check (role in ('admin', 'manager', 'member')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tai_khoan_ngay_lam_hop_le check (
    ngay_nghi_viec is null
    or ngay_vao_lam is null
    or ngay_nghi_viec >= ngay_vao_lam
  )
);

create unique index if not exists tai_khoan_email_lower_uidx
  on public.tai_khoan (lower(email))
  where email is not null;

create table if not exists public.du_an (
  id uuid primary key default gen_random_uuid(),
  ma_da text not null unique,
  ten_da text not null,
  hop_mau text not null default 'purple',
  trang_thai_cv text not null default 'active'
    check (
      trang_thai_cv in (
        'planning',
        'active',
        'paused',
        'completed',
        'cancelled'
      )
    ),
  mo_ta text,
  ngay_bd date,
  ngay_kt date,
  nguoi_ql_id uuid references public.tai_khoan(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint du_an_thoi_gian_hop_le check (
    ngay_kt is null or ngay_bd is null or ngay_kt >= ngay_bd
  )
);

-- Cot "thanhVien" trong Excel duoc chuan hoa thanh bang lien ket de co khoa ngoai.
create table if not exists public.du_an_thanh_vien (
  du_an_id uuid not null references public.du_an(id) on delete cascade,
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  vai_tro text,
  tham_gia_luc timestamptz not null default now(),
  primary key (du_an_id, tai_khoan_id)
);

create table if not exists public.cong_viec (
  id uuid primary key default gen_random_uuid(),
  ten_cv text not null,
  mo_ta text,
  du_an_id uuid not null references public.du_an(id) on delete cascade,
  nguoi_phu_trach_id uuid references public.tai_khoan(id) on delete set null,
  trang_thai text not null default 'todo'
    check (trang_thai in ('todo', 'in_progress', 'review', 'done')),
  uu_tien text not null default 'medium'
    check (uu_tien in ('low', 'medium', 'high', 'urgent')),
  ngay_bat_dau date,
  ngay_hoan_thanh date,
  tien_do_thuc_te smallint not null default 0
    check (tien_do_thuc_te between 0 and 100),
  nhan_tag text[] not null default '{}',
  cong_viec_tien_de_id uuid references public.cong_viec(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cong_viec_thoi_gian_hop_le check (
    ngay_hoan_thanh is null
    or ngay_bat_dau is null
    or ngay_hoan_thanh >= ngay_bat_dau
  ),
  constraint cong_viec_khong_tu_phu_thuoc check (
    cong_viec_tien_de_id is null or cong_viec_tien_de_id <> id
  )
);

create table if not exists public.task (
  id uuid primary key default gen_random_uuid(),
  ten_task text not null,
  mo_ta text,
  ngay_bat_dau date,
  ngay_ket_thuc date,
  nguoi_phu_trach_id uuid references public.tai_khoan(id) on delete set null,
  trang_thai text not null default 'todo'
    check (trang_thai in ('todo', 'in_progress', 'review', 'done')),
  uu_tien text not null default 'medium'
    check (uu_tien in ('low', 'medium', 'high', 'urgent')),
  tien_do_thuc_te smallint not null default 0
    check (tien_do_thuc_te between 0 and 100),
  nhan_tag text[] not null default '{}',
  task_tien_de_id uuid references public.task(id) on delete set null,
  cong_viec_id uuid not null references public.cong_viec(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_thoi_gian_hop_le check (
    ngay_ket_thuc is null
    or ngay_bat_dau is null
    or ngay_ket_thuc >= ngay_bat_dau
  ),
  constraint task_khong_tu_phu_thuoc check (
    task_tien_de_id is null or task_tien_de_id <> id
  )
);

create index if not exists phong_ban_phong_ban_cha_idx
  on public.phong_ban(phong_ban_cha_id);
create index if not exists tai_khoan_phong_ban_idx
  on public.tai_khoan(phong_ban_id);
create index if not exists du_an_nguoi_ql_idx
  on public.du_an(nguoi_ql_id);
create index if not exists du_an_thanh_vien_tai_khoan_idx
  on public.du_an_thanh_vien(tai_khoan_id);
create index if not exists cong_viec_du_an_idx
  on public.cong_viec(du_an_id);
create index if not exists cong_viec_nguoi_phu_trach_idx
  on public.cong_viec(nguoi_phu_trach_id);
create index if not exists cong_viec_tien_de_idx
  on public.cong_viec(cong_viec_tien_de_id);
create index if not exists task_cong_viec_idx
  on public.task(cong_viec_id);
create index if not exists task_nguoi_phu_trach_idx
  on public.task(nguoi_phu_trach_id);
create index if not exists task_tien_de_idx
  on public.task(task_tien_de_id);

drop trigger if exists set_phong_ban_updated_at on public.phong_ban;
create trigger set_phong_ban_updated_at
before update on public.phong_ban
for each row execute function public.set_updated_at();

drop trigger if exists set_tai_khoan_updated_at on public.tai_khoan;
create trigger set_tai_khoan_updated_at
before update on public.tai_khoan
for each row execute function public.set_updated_at();

drop trigger if exists set_du_an_updated_at on public.du_an;
create trigger set_du_an_updated_at
before update on public.du_an
for each row execute function public.set_updated_at();

drop trigger if exists set_cong_viec_updated_at on public.cong_viec;
create trigger set_cong_viec_updated_at
before update on public.cong_viec
for each row execute function public.set_updated_at();

drop trigger if exists set_task_updated_at on public.task;
create trigger set_task_updated_at
before update on public.task
for each row execute function public.set_updated_at();

alter table public.phong_ban enable row level security;
alter table public.tai_khoan enable row level security;
alter table public.du_an enable row level security;
alter table public.du_an_thanh_vien enable row level security;
alter table public.cong_viec enable row level security;
alter table public.task enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'phong_ban',
    'tai_khoan',
    'du_an',
    'du_an_thanh_vien',
    'cong_viec',
    'task'
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
  end loop;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.phong_ban,
  public.tai_khoan,
  public.du_an,
  public.du_an_thanh_vien,
  public.cong_viec,
  public.task
to authenticated;

comment on table public.phong_ban is 'Phong ban; tao tu sheet phongBan.';
comment on table public.tai_khoan is 'Ho so nhan vien/tai khoan; tao tu sheet taiKhoan.';
comment on table public.du_an is 'Du an; tao tu sheet duAn.';
comment on table public.du_an_thanh_vien is 'Thanh vien du an; chuan hoa tu cot duAn.thanhVien.';
comment on table public.cong_viec is 'Cong viec cap du an; tao tu sheet congViec.';
comment on table public.task is 'Task con cua cong viec; tao tu sheet task.';
comment on column public.tai_khoan.auth_user_id is
  'Lien ket tuy chon den auth.users. Mat khau duoc Supabase Auth quan ly.';
comment on column public.tai_khoan.so_tai_khoan is 'Anh xa tu cot STK trong Excel.';
comment on column public.phong_ban.chuc_vu is
  'Danh sach chuc vu cua phong ban; anh xa tu cot chucVu trong Excel.';
comment on column public.cong_viec.nhan_tag is 'Anh xa tu cot nhanTag trong Excel.';
comment on column public.task.nhan_tag is 'Anh xa tu cot nhanTag trong Excel.';

-- ===== 20260729000200_add_project_steps.sql =====
alter table public.du_an
  add column if not exists steps jsonb not null default
  '[
    {"key":"todo","label":"Cần làm","enabled":true},
    {"key":"inProgress","label":"Đang làm","enabled":true},
    {"key":"review","label":"Chờ đánh giá","enabled":true},
    {"key":"done","label":"Hoàn thành","enabled":true}
  ]'::jsonb;

comment on column public.du_an.steps is
  'Cau hinh cac buoc trang thai cua du an, luu duoi dang JSON.';

-- ===== 20260729000300_dev_anon_project_api.sql =====
-- Quyen tam thoi cho giai doan phat trien khong co man hinh dang nhap.
-- Truoc khi production, can thu hoi cac quyen anon va dung lai authenticated.

alter table public.du_an enable row level security;
alter table public.du_an_thanh_vien enable row level security;
alter table public.cong_viec enable row level security;
alter table public.task enable row level security;
alter table public.tai_khoan enable row level security;

drop policy if exists "du_an_all_anon_dev" on public.du_an;
create policy "du_an_all_anon_dev"
  on public.du_an
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "du_an_thanh_vien_all_anon_dev" on public.du_an_thanh_vien;
create policy "du_an_thanh_vien_all_anon_dev"
  on public.du_an_thanh_vien
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "cong_viec_all_anon_dev" on public.cong_viec;
create policy "cong_viec_all_anon_dev"
  on public.cong_viec
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "task_all_anon_dev" on public.task;
create policy "task_all_anon_dev"
  on public.task
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "tai_khoan_directory_anon_dev" on public.tai_khoan;
create policy "tai_khoan_directory_anon_dev"
  on public.tai_khoan
  for select
  to anon
  using (true);

grant select, insert, update, delete
  on public.du_an, public.du_an_thanh_vien, public.cong_viec, public.task
  to anon;

revoke all on public.tai_khoan from anon;
grant select (
  id,
  ma_nv,
  ten_nv,
  chuc_vu,
  email,
  avatar_url,
  status
) on public.tai_khoan to anon;

-- ===== 20260729000400_task_progress_reports.sql =====
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

-- ===== 20260729000500_kanban_thu_tu.sql =====
-- Ho tro bang Kanban: luu thu tu the trong tung cot trang thai.
-- Man hinh: Quan ly cong viec > Bang Kanban.

alter table public.cong_viec
  add column if not exists thu_tu integer not null default 0;

-- Backfill: danh so lai theo tung cot trang thai, giu nguyen thu tu tao.
with da_danh_so as (
  select
    id,
    row_number() over (
      partition by trang_thai
      order by created_at, id
    ) - 1 as vi_tri
  from public.cong_viec
)
update public.cong_viec as cv
set thu_tu = da_danh_so.vi_tri
from da_danh_so
where cv.id = da_danh_so.id;

create index if not exists cong_viec_kanban_idx
  on public.cong_viec(trang_thai, thu_tu);

comment on column public.cong_viec.thu_tu is
  'Thu tu the trong cot Kanban, tinh tu 0 trong pham vi moi trang_thai.';

-- Di chuyen mot the sang cot/vi tri moi va danh so lai ca hai cot.
-- Chay trong mot cau lenh nen dam bao tinh nguyen tu.
create or replace function public.di_chuyen_cong_viec(
  p_id uuid,
  p_trang_thai text,
  p_vi_tri integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trang_thai_cu text;
begin
  if p_trang_thai not in ('todo', 'in_progress', 'review', 'done') then
    raise exception 'Trang thai khong hop le: %', p_trang_thai;
  end if;
  if p_vi_tri < 0 then
    raise exception 'Vi tri phai lon hon hoac bang 0';
  end if;

  select trang_thai into v_trang_thai_cu
  from public.cong_viec
  where id = p_id
  for update;

  if v_trang_thai_cu is null then
    raise exception 'Khong tim thay cong viec %', p_id;
  end if;

  -- Nhan doi thu tu cac the con lai o cot dich de chua vi tri chen.
  update public.cong_viec as cv
  set thu_tu = danh_so.vi_tri * 2
  from (
    select
      id,
      row_number() over (order by thu_tu, created_at, id) as vi_tri
    from public.cong_viec
    where trang_thai = p_trang_thai
      and id <> p_id
  ) as danh_so
  where cv.id = danh_so.id;

  -- The duoc keo nhan so le nen roi dung khe mong muon.
  update public.cong_viec
  set
    trang_thai = p_trang_thai,
    thu_tu = p_vi_tri * 2 + 1,
    tien_do_thuc_te = case
      when p_trang_thai = 'done' then 100
      else tien_do_thuc_te
    end
  where id = p_id;

  -- Danh so lai lien tuc tu 0 cho cot dich.
  update public.cong_viec as cv
  set thu_tu = danh_so.vi_tri
  from (
    select
      id,
      row_number() over (order by thu_tu, created_at, id) - 1 as vi_tri
    from public.cong_viec
    where trang_thai = p_trang_thai
  ) as danh_so
  where cv.id = danh_so.id
    and cv.thu_tu <> danh_so.vi_tri;

  -- Don khoang trong o cot nguon khi the doi cot.
  if v_trang_thai_cu <> p_trang_thai then
    update public.cong_viec as cv
    set thu_tu = danh_so.vi_tri
    from (
      select
        id,
        row_number() over (order by thu_tu, created_at, id) - 1 as vi_tri
      from public.cong_viec
      where trang_thai = v_trang_thai_cu
    ) as danh_so
    where cv.id = danh_so.id
      and cv.thu_tu <> danh_so.vi_tri;
  end if;
end;
$$;

grant execute on function public.di_chuyen_cong_viec(uuid, text, integer)
  to anon, authenticated;

comment on function public.di_chuyen_cong_viec(uuid, text, integer) is
  'Keo tha Kanban: doi trang thai + vi tri cua cong viec, danh so lai cot nguon va cot dich.';

-- ===== 20260729000600_sync_kanban_progress.sql =====
-- Dong bo tien do thuc te theo cot dich khi keo tha Kanban.
-- Sap xep lai trong cung mot cot khong lam thay doi tien do.

create or replace function public.di_chuyen_cong_viec(
  p_id uuid,
  p_trang_thai text,
  p_vi_tri integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trang_thai_cu text;
begin
  if p_trang_thai not in ('todo', 'in_progress', 'review', 'done') then
    raise exception 'Trang thai khong hop le: %', p_trang_thai;
  end if;
  if p_vi_tri < 0 then
    raise exception 'Vi tri phai lon hon hoac bang 0';
  end if;

  select trang_thai into v_trang_thai_cu
  from public.cong_viec
  where id = p_id
  for update;

  if v_trang_thai_cu is null then
    raise exception 'Khong tim thay cong viec %', p_id;
  end if;

  -- Nhan doi thu tu cac the con lai o cot dich de chua vi tri chen.
  update public.cong_viec as cv
  set thu_tu = danh_so.vi_tri * 2
  from (
    select
      id,
      row_number() over (order by thu_tu, created_at, id) as vi_tri
    from public.cong_viec
    where trang_thai = p_trang_thai
      and id <> p_id
  ) as danh_so
  where cv.id = danh_so.id;

  -- Khi doi cot, tien do phai dong bo theo cot dich.
  update public.cong_viec
  set
    trang_thai = p_trang_thai,
    thu_tu = p_vi_tri * 2 + 1,
    tien_do_thuc_te = case
      when v_trang_thai_cu = p_trang_thai then tien_do_thuc_te
      when p_trang_thai = 'todo' then 0
      when p_trang_thai = 'in_progress' then 30
      when p_trang_thai = 'review' then 70
      when p_trang_thai = 'done' then 100
    end
  where id = p_id;

  -- Danh so lai lien tuc tu 0 cho cot dich.
  update public.cong_viec as cv
  set thu_tu = danh_so.vi_tri
  from (
    select
      id,
      row_number() over (order by thu_tu, created_at, id) - 1 as vi_tri
    from public.cong_viec
    where trang_thai = p_trang_thai
  ) as danh_so
  where cv.id = danh_so.id
    and cv.thu_tu <> danh_so.vi_tri;

  -- Don khoang trong o cot nguon khi the doi cot.
  if v_trang_thai_cu <> p_trang_thai then
    update public.cong_viec as cv
    set thu_tu = danh_so.vi_tri
    from (
      select
        id,
        row_number() over (order by thu_tu, created_at, id) - 1 as vi_tri
      from public.cong_viec
      where trang_thai = v_trang_thai_cu
    ) as danh_so
    where cv.id = danh_so.id
      and cv.thu_tu <> danh_so.vi_tri;
  end if;
end;
$$;

comment on function public.di_chuyen_cong_viec(uuid, text, integer) is
  'Keo tha Kanban: doi trang thai, vi tri va dong bo tien do theo cot dich.';

-- ===== 20260729000700_multiple_project_managers.sql =====
-- Mot du an co the co nhieu nguoi quan ly.
-- Cot du_an.nguoi_ql_id van duoc giu lam nguoi quan ly chinh de tuong thich.

create table if not exists public.du_an_quan_ly (
  du_an_id uuid not null references public.du_an(id) on delete cascade,
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  la_chinh boolean not null default false,
  phan_cong_luc timestamptz not null default now(),
  primary key (du_an_id, tai_khoan_id)
);

create index if not exists du_an_quan_ly_tai_khoan_idx
  on public.du_an_quan_ly(tai_khoan_id);

insert into public.du_an_quan_ly (du_an_id, tai_khoan_id, la_chinh)
select id, nguoi_ql_id, true
from public.du_an
where nguoi_ql_id is not null
on conflict (du_an_id, tai_khoan_id) do update
set la_chinh = excluded.la_chinh;

alter table public.du_an_quan_ly enable row level security;

drop policy if exists "du_an_quan_ly_select_authenticated" on public.du_an_quan_ly;
create policy "du_an_quan_ly_select_authenticated"
  on public.du_an_quan_ly for select to authenticated using (true);

drop policy if exists "du_an_quan_ly_insert_authenticated" on public.du_an_quan_ly;
create policy "du_an_quan_ly_insert_authenticated"
  on public.du_an_quan_ly for insert to authenticated with check (true);

drop policy if exists "du_an_quan_ly_update_authenticated" on public.du_an_quan_ly;
create policy "du_an_quan_ly_update_authenticated"
  on public.du_an_quan_ly for update to authenticated using (true) with check (true);

drop policy if exists "du_an_quan_ly_delete_authenticated" on public.du_an_quan_ly;
create policy "du_an_quan_ly_delete_authenticated"
  on public.du_an_quan_ly for delete to authenticated using (true);

drop policy if exists "du_an_quan_ly_all_anon_dev" on public.du_an_quan_ly;
create policy "du_an_quan_ly_all_anon_dev"
  on public.du_an_quan_ly for all to anon using (true) with check (true);

grant select, insert, update, delete on public.du_an_quan_ly
  to anon, authenticated;

comment on table public.du_an_quan_ly is
  'Danh sach nhieu nguoi quan ly cua mot du an.';

-- ===== 20260729000800_multiple_assignees.sql =====
-- Mot cong viec / task co the co nhieu nguoi phu trach.
-- Rang buoc nghiep vu:
--   - Nguoi phu trach cong viec phai tham gia du an cua cong viec do.
--   - Nguoi phu trach task phai nam trong nhom phu trach cong viec cha.
-- Cot nguoi_phu_trach_id cu duoc giu lam nguoi phu trach chinh de tuong thich.

create table if not exists public.cong_viec_phu_trach (
  cong_viec_id uuid not null references public.cong_viec(id) on delete cascade,
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  la_chinh boolean not null default false,
  phan_cong_luc timestamptz not null default now(),
  primary key (cong_viec_id, tai_khoan_id)
);

create table if not exists public.task_phu_trach (
  task_id uuid not null references public.task(id) on delete cascade,
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  la_chinh boolean not null default false,
  phan_cong_luc timestamptz not null default now(),
  primary key (task_id, tai_khoan_id)
);

create index if not exists cong_viec_phu_trach_tai_khoan_idx
  on public.cong_viec_phu_trach(tai_khoan_id);
create index if not exists task_phu_trach_tai_khoan_idx
  on public.task_phu_trach(tai_khoan_id);

-- 1. Chuyen nguoi phu trach hien tai sang bang moi, danh dau la nguoi chinh.
insert into public.cong_viec_phu_trach (cong_viec_id, tai_khoan_id, la_chinh)
select id, nguoi_phu_trach_id, true
from public.cong_viec
where nguoi_phu_trach_id is not null
on conflict (cong_viec_id, tai_khoan_id) do update
set la_chinh = excluded.la_chinh;

insert into public.task_phu_trach (task_id, tai_khoan_id, la_chinh)
select id, nguoi_phu_trach_id, true
from public.task
where nguoi_phu_trach_id is not null
on conflict (task_id, tai_khoan_id) do update
set la_chinh = excluded.la_chinh;

-- 2. Nguoi phu trach task phai co trong nhom phu trach cong viec cha.
insert into public.cong_viec_phu_trach (cong_viec_id, tai_khoan_id, la_chinh)
select distinct t.cong_viec_id, tpt.tai_khoan_id, false
from public.task_phu_trach as tpt
join public.task as t on t.id = tpt.task_id
on conflict (cong_viec_id, tai_khoan_id) do nothing;

-- 3. Nguoi phu trach cong viec phai tham gia du an tuong ung.
insert into public.du_an_thanh_vien (du_an_id, tai_khoan_id)
select distinct cv.du_an_id, cvpt.tai_khoan_id
from public.cong_viec_phu_trach as cvpt
join public.cong_viec as cv on cv.id = cvpt.cong_viec_id
where not exists (
  select 1
  from public.du_an_quan_ly as dql
  where dql.du_an_id = cv.du_an_id
    and dql.tai_khoan_id = cvpt.tai_khoan_id
)
on conflict (du_an_id, tai_khoan_id) do nothing;

alter table public.cong_viec_phu_trach enable row level security;
alter table public.task_phu_trach enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['cong_viec_phu_trach', 'task_phu_trach']
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

    -- Quyen tam thoi cho giai doan phat trien chua co man hinh dang nhap.
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

grant select, insert, update, delete
  on public.cong_viec_phu_trach, public.task_phu_trach
  to anon, authenticated;

comment on table public.cong_viec_phu_trach is
  'Nhieu nguoi phu trach cua mot cong viec; chi gom nguoi tham gia du an cua cong viec.';
comment on table public.task_phu_trach is
  'Nhieu nguoi phu trach cua mot task; chi gom nguoi phu trach cong viec cha.';

-- ===== 20260729000900_separate_project_managers_members.sql =====
-- Nguoi quan ly va thanh vien tham gia la hai danh sach khong trung nhau.
-- Lam sach cac ban ghi cu sau khi chuyen sang nhieu nguoi quan ly.

delete from public.du_an_thanh_vien as thanh_vien
using public.du_an_quan_ly as quan_ly
where thanh_vien.du_an_id = quan_ly.du_an_id
  and thanh_vien.tai_khoan_id = quan_ly.tai_khoan_id;

-- ===== 20260729001000_subtask_progress_reports.sql =====
-- Bao cao tien do Task co day du anh, file va lien ket nhu bao cao Cong viec.

create table if not exists public.bao_cao_task (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task(id) on delete cascade,
  nguoi_bao_cao_id uuid references public.tai_khoan(id) on delete set null,
  noi_dung text not null check (length(btrim(noi_dung)) > 0),
  tien_do smallint not null default 0 check (tien_do between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bao_cao_task_dinh_kem (
  id uuid primary key default gen_random_uuid(),
  bao_cao_id uuid not null references public.bao_cao_task(id) on delete cascade,
  loai text not null check (loai in ('image', 'file')),
  ten_file text not null,
  duong_dan text not null,
  kieu_file text,
  kich_thuoc bigint check (kich_thuoc is null or kich_thuoc >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.bao_cao_task_lien_ket (
  id uuid primary key default gen_random_uuid(),
  bao_cao_id uuid not null references public.bao_cao_task(id) on delete cascade,
  nhan text,
  duong_dan text not null,
  created_at timestamptz not null default now()
);

create index if not exists bao_cao_task_task_idx
  on public.bao_cao_task(task_id, created_at desc);
create index if not exists bao_cao_task_nguoi_bao_cao_idx
  on public.bao_cao_task(nguoi_bao_cao_id);
create index if not exists bao_cao_task_dinh_kem_bao_cao_idx
  on public.bao_cao_task_dinh_kem(bao_cao_id);
create index if not exists bao_cao_task_lien_ket_bao_cao_idx
  on public.bao_cao_task_lien_ket(bao_cao_id);

drop trigger if exists set_bao_cao_task_updated_at on public.bao_cao_task;
create trigger set_bao_cao_task_updated_at
before update on public.bao_cao_task
for each row execute function public.set_updated_at();

alter table public.bao_cao_task enable row level security;
alter table public.bao_cao_task_dinh_kem enable row level security;
alter table public.bao_cao_task_lien_ket enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'bao_cao_task',
    'bao_cao_task_dinh_kem',
    'bao_cao_task_lien_ket'
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
  public.bao_cao_task,
  public.bao_cao_task_dinh_kem,
  public.bao_cao_task_lien_ket
to anon, authenticated;

comment on table public.bao_cao_task is
  'Bao cao tien do cua Task; moi ban ghi luu snapshot tien do tai thoi diem bao cao.';

-- ===== 20260729001100_dev_anon_account_management.sql =====
-- Quyen phat trien cho man hinh quan ly tai khoan khi ung dung chua co dang nhap.
-- Khi bat Supabase Auth o production, xoa cac policy anon nay.
alter table public.tai_khoan enable row level security;
alter table public.phong_ban enable row level security;

drop policy if exists tai_khoan_manage_anon_dev on public.tai_khoan;
create policy tai_khoan_manage_anon_dev
on public.tai_khoan for all to anon
using (true) with check (true);

drop policy if exists phong_ban_select_anon_dev on public.phong_ban;
create policy phong_ban_select_anon_dev
on public.phong_ban for select to anon
using (true);

grant select, insert, update, delete on public.tai_khoan to anon;
grant select on public.phong_ban to anon;

-- ===== 20260729001200_dev_anon_department_management.sql =====
-- Quyen phat trien cho man hinh Phong ban & Chuc vu khi ung dung chua co dang nhap.
-- Khi bat Supabase Auth o production, xoa policy anon nay.
alter table public.phong_ban enable row level security;

drop policy if exists phong_ban_select_anon_dev on public.phong_ban;
drop policy if exists phong_ban_manage_anon_dev on public.phong_ban;
create policy phong_ban_manage_anon_dev
on public.phong_ban for all to anon
using (true) with check (true);

grant select, insert, update, delete on public.phong_ban to anon;

-- ===== 20260729001300_department_position_structure.sql =====
-- Luu cau truc cap bac va quan he quan ly giua cac chuc vu trong phong ban.
alter table public.phong_ban
  add column if not exists cau_truc_chuc_vu jsonb not null default '[]'::jsonb;

update public.phong_ban as pb
set cau_truc_chuc_vu = structures.value
from (
  select
    department.id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'name', position.name,
          'level', position.ordinality,
          'managerId', null
        )
        order by position.ordinality
      ) filter (where position.name is not null),
      '[]'::jsonb
    ) as value
  from public.phong_ban as department
  left join lateral unnest(department.chuc_vu)
    with ordinality as position(name, ordinality) on true
  group by department.id
) as structures
where pb.id = structures.id
  and pb.cau_truc_chuc_vu = '[]'::jsonb;

alter table public.phong_ban
  drop constraint if exists phong_ban_cau_truc_chuc_vu_array;
alter table public.phong_ban
  add constraint phong_ban_cau_truc_chuc_vu_array
  check (jsonb_typeof(cau_truc_chuc_vu) = 'array');

comment on column public.phong_ban.cau_truc_chuc_vu is
  'Danh sach JSON chuc vu: id, name, level va managerId.';

-- ===== 20260730000100_add_task_images.sql =====
alter table public.task
  add column if not exists hinh_anh text[] not null default '{}';

comment on column public.task.hinh_anh is
  'Danh sach URL anh minh hoa cua Task, toi da 10 anh theo validation API.';

-- ===== 20260730000200_add_task_attachments.sql =====
alter table public.task
  add column if not exists tep_dinh_kem jsonb not null default '[]'::jsonb,
  add column if not exists lien_ket_dinh_kem jsonb not null default '[]'::jsonb;

comment on column public.task.tep_dinh_kem is
  'Danh sach tep dinh kem cua Task, dang [{"name":"...","url":"..."}], url tro toi Google Drive.';
comment on column public.task.lien_ket_dinh_kem is
  'Danh sach lien ket dinh kem cua Task, dang [{"label":"...","url":"..."}].';

-- ===== 20260730000300_use_long_text_for_descriptions.sql =====
-- PostgreSQL does not have MySQL's LONGTEXT type.
-- `text` is the native variable-length type for long descriptions.
alter table public.du_an
  alter column mo_ta type text using mo_ta::text;

alter table public.cong_viec
  alter column mo_ta type text using mo_ta::text;

alter table public.task
  alter column mo_ta type text using mo_ta::text;

comment on column public.du_an.mo_ta is
  'Mo ta du an dang van ban dai (PostgreSQL text).';

comment on column public.cong_viec.mo_ta is
  'Mo ta cong viec dang van ban dai (PostgreSQL text).';

comment on column public.task.mo_ta is
  'Mo ta task dang van ban dai (PostgreSQL text).';

-- ===== 20260730000400_add_task_project_attachments.sql =====
alter table public.cong_viec
  add column if not exists hinh_anh text[] not null default '{}',
  add column if not exists tep_dinh_kem jsonb not null default '[]'::jsonb,
  add column if not exists lien_ket_dinh_kem jsonb not null default '[]'::jsonb;

alter table public.du_an
  add column if not exists hinh_anh text[] not null default '{}',
  add column if not exists tep_dinh_kem jsonb not null default '[]'::jsonb,
  add column if not exists lien_ket_dinh_kem jsonb not null default '[]'::jsonb;

comment on column public.cong_viec.hinh_anh is
  'Danh sach URL anh minh hoa cua cong viec, toi da 10 anh theo validation API.';
comment on column public.cong_viec.tep_dinh_kem is
  'Danh sach tep dinh kem cua cong viec, dang [{"name":"...","url":"..."}], url tro toi Google Drive.';
comment on column public.cong_viec.lien_ket_dinh_kem is
  'Danh sach lien ket dinh kem cua cong viec, dang [{"label":"...","url":"..."}].';

comment on column public.du_an.hinh_anh is
  'Danh sach URL anh minh hoa cua du an, toi da 10 anh theo validation API.';
comment on column public.du_an.tep_dinh_kem is
  'Danh sach tep dinh kem cua du an, dang [{"name":"...","url":"..."}], url tro toi Google Drive.';
comment on column public.du_an.lien_ket_dinh_kem is
  'Danh sach lien ket dinh kem cua du an, dang [{"label":"...","url":"..."}].';

-- ===== 20260731000100_production_rls_cleanup.sql =====
-- Production RLS cleanup.
-- API requests now forward the Supabase access token, so the temporary anon
-- policies and grants used during development can be removed safely.

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like '%_anon_dev'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

-- All application data is served by Next.js API routes with a forwarded JWT.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated;

-- These policies were deliberately open to anon for development. Keep report
-- attachments available to signed-in users only.
alter policy "bao_cao_storage_select" on storage.objects to authenticated;
alter policy "bao_cao_storage_insert" on storage.objects to authenticated;
alter policy "bao_cao_storage_delete" on storage.objects to authenticated;

-- ===== 20260731000200_finance_thu_chi.sql =====
create table public.thu_chi_danh_muc (
  id uuid primary key default gen_random_uuid(),
  ten text not null,
  loai text not null check (loai in ('thu', 'chi')),
  ngan_sach_thang numeric(14,2) check (ngan_sach_thang is null or ngan_sach_thang >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ten, loai)
);

create table public.thu_chi (
  id uuid primary key default gen_random_uuid(),
  loai text not null check (loai in ('thu', 'chi')),
  so_tien numeric(14,2) not null check (so_tien > 0),
  ngay date not null,
  danh_muc_id uuid not null references public.thu_chi_danh_muc(id) on delete restrict,
  mo_ta text,
  tep_hoa_don text,
  nguoi_tao_id uuid references public.tai_khoan(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index thu_chi_ngay_idx on public.thu_chi(ngay);
create index thu_chi_danh_muc_id_idx on public.thu_chi(danh_muc_id);
create index thu_chi_loai_idx on public.thu_chi(loai);
create index thu_chi_ngay_loai_idx on public.thu_chi(ngay, loai);
create trigger set_thu_chi_updated_at before update on public.thu_chi for each row execute function public.set_updated_at();
create trigger set_thu_chi_danh_muc_updated_at before update on public.thu_chi_danh_muc for each row execute function public.set_updated_at();
alter table public.thu_chi enable row level security;
alter table public.thu_chi_danh_muc enable row level security;
create policy thu_chi_authenticated on public.thu_chi for all to authenticated using (true) with check (true);
create policy thu_chi_danh_muc_authenticated on public.thu_chi_danh_muc for all to authenticated using (true) with check (true);

create or replace function public.thu_chi_tong_hop(p_start date, p_end date)
returns table(ngay date, loai text, tong_tien numeric)
language sql stable security invoker set search_path = '' as $$
  select t.ngay, t.loai, sum(t.so_tien) from public.thu_chi t
  where t.ngay between p_start and p_end group by t.ngay, t.loai order by t.ngay, t.loai;
$$;
grant execute on function public.thu_chi_tong_hop(date, date) to authenticated;

-- ===== 20260731000300_enforce_subtask_approval_progress.sql =====
-- Tiến độ Task chỉ đạt trạng thái chờ duyệt ở 100%; hoàn thành phải qua bước duyệt.
-- Đồng thời sửa các bản ghi cũ có trạng thái không khớp với tiến độ.

update public.task
set tien_do_thuc_te = 100
where trang_thai = 'done'
  and tien_do_thuc_te <> 100;

update public.task
set trang_thai = case
  when tien_do_thuc_te > 0 then 'in_progress'
  else 'todo'
end
where trang_thai = 'review'
  and tien_do_thuc_te < 100;

alter table public.task
drop constraint if exists task_approval_progress_consistent;

alter table public.task
add constraint task_approval_progress_consistent check (
  (tien_do_thuc_te = 100 and trang_thai in ('review', 'done'))
  or
  (tien_do_thuc_te < 100 and trang_thai not in ('review', 'done'))
);

-- ===== 20260731000350_finance_category_type_guard.sql =====
create or replace function public.validate_thu_chi_category_type()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  category_type text;
begin
  select loai into category_type
  from public.thu_chi_danh_muc
  where id = new.danh_muc_id;

  if category_type is null then
    raise foreign_key_violation using message = 'Danh mục thu chi không tồn tại.';
  end if;

  if category_type <> new.loai then
    raise check_violation using message = 'Danh mục không phù hợp với loại giao dịch.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_thu_chi_category_type_before_write on public.thu_chi;
create trigger validate_thu_chi_category_type_before_write
before insert or update of loai, danh_muc_id on public.thu_chi
for each row execute function public.validate_thu_chi_category_type();

-- ===== 20260731000400_sync_work_task_status_from_subtasks.sql =====
-- Trạng thái Công việc là dữ liệu suy ra từ các Task con, không cập nhật thủ công.
-- Chỉ khi có ít nhất một Task và tất cả Task đều "done" thì Công việc mới "done".

create or replace function public.derive_cong_viec_status(p_cong_viec_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when count(*) = 0 then 'todo'
    when bool_and(t.trang_thai = 'done') then 'done'
    when bool_or(t.tien_do_thuc_te > 0 or t.trang_thai <> 'todo') then 'in_progress'
    else 'todo'
  end
  from public.task as t
  where t.cong_viec_id = p_cong_viec_id;
$$;

create or replace function public.enforce_cong_viec_derived_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.trang_thai := public.derive_cong_viec_status(new.id);
  return new;
end;
$$;

drop trigger if exists enforce_cong_viec_derived_status on public.cong_viec;
create trigger enforce_cong_viec_derived_status
before insert or update of trang_thai on public.cong_viec
for each row
execute function public.enforce_cong_viec_derived_status();

create or replace function public.sync_cong_viec_status_after_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.cong_viec
    set trang_thai = public.derive_cong_viec_status(old.cong_viec_id)
    where id = old.cong_viec_id;
  elsif tg_op = 'INSERT' then
    update public.cong_viec
    set trang_thai = public.derive_cong_viec_status(new.cong_viec_id)
    where id = new.cong_viec_id;
  else
    update public.cong_viec
    set trang_thai = public.derive_cong_viec_status(new.cong_viec_id)
    where id = new.cong_viec_id;

    if new.cong_viec_id is distinct from old.cong_viec_id then
      update public.cong_viec
      set trang_thai = public.derive_cong_viec_status(old.cong_viec_id)
      where id = old.cong_viec_id;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_cong_viec_status_after_task_change on public.task;
create trigger sync_cong_viec_status_after_task_change
after insert or update of trang_thai, tien_do_thuc_te, cong_viec_id or delete on public.task
for each row
execute function public.sync_cong_viec_status_after_task_change();

-- Đồng bộ lại dữ liệu cũ để bộ lọc trạng thái và các truy vấn trực tiếp luôn đúng.
update public.cong_viec
set trang_thai = public.derive_cong_viec_status(id);

revoke all on function public.derive_cong_viec_status(uuid) from public;
revoke all on function public.enforce_cong_viec_derived_status() from public;
revoke all on function public.sync_cong_viec_status_after_task_change() from public;

-- ===== 20260731000500_task_assignment_acceptance_notifications.sql =====
-- Moi nguoi duoc giao Task phai xac nhan truoc khi bat dau lam.
-- Cac phan cong cu duoc danh dau da xac nhan de khong lam thay doi luong dang su dung.
alter table public.task_phu_trach
  add column if not exists xac_nhan_luc timestamptz;

update public.task_phu_trach
set xac_nhan_luc = coalesce(xac_nhan_luc, phan_cong_luc, now());

comment on column public.task_phu_trach.xac_nhan_luc is
  'Thoi diem nhan vien xac nhan nhan Task; null nghia la dang cho xac nhan.';

create table if not exists public.thong_bao (
  id uuid primary key default gen_random_uuid(),
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  loai text not null check (loai in ('task_assigned')),
  tieu_de text not null,
  noi_dung text not null,
  task_id uuid references public.task(id) on delete cascade,
  da_doc boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists thong_bao_tai_khoan_created_idx
  on public.thong_bao(tai_khoan_id, created_at desc);
create index if not exists thong_bao_tai_khoan_chua_doc_idx
  on public.thong_bao(tai_khoan_id, da_doc)
  where da_doc = false;

alter table public.thong_bao enable row level security;

drop policy if exists thong_bao_select_own on public.thong_bao;
create policy thong_bao_select_own
  on public.thong_bao
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tai_khoan tk
      where tk.id = thong_bao.tai_khoan_id
        and tk.auth_user_id = auth.uid()
    )
  );

drop policy if exists thong_bao_update_own on public.thong_bao;
create policy thong_bao_update_own
  on public.thong_bao
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tai_khoan tk
      where tk.id = thong_bao.tai_khoan_id
        and tk.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tai_khoan tk
      where tk.id = thong_bao.tai_khoan_id
        and tk.auth_user_id = auth.uid()
    )
  );

revoke all on public.thong_bao from anon;
revoke all on public.thong_bao from authenticated;
grant select on public.thong_bao to authenticated;
grant update (da_doc) on public.thong_bao to authenticated;

create or replace function public.tao_thong_bao_task_duoc_giao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_name text;
  work_task_name text;
begin
  select t.ten_task, cv.ten_cv
    into task_name, work_task_name
  from public.task t
  left join public.cong_viec cv on cv.id = t.cong_viec_id
  where t.id = new.task_id;

  insert into public.thong_bao (
    tai_khoan_id,
    loai,
    tieu_de,
    noi_dung,
    task_id
  )
  values (
    new.tai_khoan_id,
    'task_assigned',
    'Bạn được giao Task mới',
    case
      when work_task_name is not null then
        'Task “' || coalesce(task_name, 'Chưa đặt tên') || '” thuộc công việc “' || work_task_name || '”.'
      else
        'Bạn vừa được giao Task “' || coalesce(task_name, 'Chưa đặt tên') || '”.'
    end,
    new.task_id
  );

  return new;
end;
$$;

drop trigger if exists task_phu_trach_notify_assignee on public.task_phu_trach;
create trigger task_phu_trach_notify_assignee
after insert on public.task_phu_trach
for each row
execute function public.tao_thong_bao_task_duoc_giao();

revoke execute on function public.tao_thong_bao_task_duoc_giao() from public, anon, authenticated;

comment on table public.thong_bao is
  'Thong bao noi bo theo tung tai khoan, hien thi tai chuong tren thanh Header.';

-- ===== 20260801000100_optimize_login_lookup.sql =====
-- Username/email được chuẩn hoá chữ thường khi ghi, nhờ đó đăng nhập có thể
-- dùng so sánh bằng và B-tree index thay cho ILIKE.

update public.tai_khoan
set username = lower(btrim(username))
where username is not null
  and username <> lower(btrim(username));

update public.tai_khoan
set email = lower(btrim(email))
where email is not null
  and email <> lower(btrim(email));

drop index if exists public.tai_khoan_email_lower_uidx;

create unique index if not exists tai_khoan_email_uidx
  on public.tai_khoan (email)
  where email is not null;

alter table public.tai_khoan
drop constraint if exists tai_khoan_username_lowercase;

alter table public.tai_khoan
add constraint tai_khoan_username_lowercase check (
  username is null or username = lower(btrim(username))
);

alter table public.tai_khoan
drop constraint if exists tai_khoan_email_lowercase;

alter table public.tai_khoan
add constraint tai_khoan_email_lowercase check (
  email is null or email = lower(btrim(email))
);

-- ===== 20260801000200_restore_service_role_privileges.sql =====
-- Backend API routes use the service-role client for trusted administrative work.
-- RLS bypass alone is not enough: the role still needs PostgreSQL privileges.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Keep future objects created by migrations available to the backend client.
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- ===== 20260802000100_search_and_pagination_indexes.sql =====
-- GĐ2 (PERF-UNIFIED-IMPLEMENTATION-PLAN.md): tìm kiếm công việc/task hiện dùng
-- ILIKE '%term%' gây Seq Scan (đã xác nhận bằng EXPLAIN trước migration này).
-- Thêm chỉ mục trigram để tăng tốc ILIKE, và chỉ mục (created_at desc, id desc)
-- cho phân trang offset đang dùng .order("created_at", { ascending: false }).

create extension if not exists pg_trgm;

create index if not exists cong_viec_ten_cv_trgm_idx
  on public.cong_viec using gin (ten_cv gin_trgm_ops);

create index if not exists task_ten_task_trgm_idx
  on public.task using gin (ten_task gin_trgm_ops);

create index if not exists cong_viec_created_at_id_idx
  on public.cong_viec (created_at desc, id desc);

create index if not exists task_created_at_id_idx
  on public.task (created_at desc, id desc);

-- ===== 20260802000200_mutation_requests_idempotency.sql =====
-- Giai đoạn 9 (PERF-UNIFIED-IMPLEMENTATION-PLAN.md): idempotency cho các thao tác
-- tạo quan trọng (dự án/công việc/task). Unique constraint (không phải SELECT rồi
-- INSERT) là lớp chặn race condition thật khi 2 request cùng key đến gần như đồng
-- thời — chỉ 1 trong 2 có thể insert thành công, request thua phát hiện qua lỗi
-- unique_violation (23505) và tự đọc lại kết quả đã lưu.
create table if not exists public.mutation_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tai_khoan(id) on delete cascade,
  idempotency_key uuid not null,
  -- Tên endpoint/loại thao tác (vd. "create-project") — cùng key nhưng khác scope
  -- (hiếm, do lỗi client) vẫn được coi là 2 thao tác khác nhau.
  scope text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (account_id, idempotency_key, scope)
);

create index if not exists mutation_requests_created_at_idx
  on public.mutation_requests (created_at);

alter table public.mutation_requests enable row level security;
create policy mutation_requests_authenticated
  on public.mutation_requests for all to authenticated using (true) with check (true);

-- ===== 20260803000100_sync_subtask_status_progress.sql =====
-- Giữ trạng thái Task và tiến độ thực tế nhất quán ở tầng database.
-- API cũng áp dụng quy tắc này, nhưng trigger bảo vệ mọi luồng ghi trực tiếp/RPC.

create or replace function public.sync_task_progress_from_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.trang_thai is distinct from old.trang_thai then
    new.tien_do_thuc_te := case
      when new.trang_thai = 'todo' then 0
      when new.trang_thai = 'in_progress' then
        case
          when new.tien_do_thuc_te > 0 and new.tien_do_thuc_te < 100
            then new.tien_do_thuc_te
          else 1
        end
      when new.trang_thai in ('review', 'done') then 100
      else new.tien_do_thuc_te
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_task_progress_from_status on public.task;
create trigger sync_task_progress_from_status
before insert or update of trang_thai on public.task
for each row execute function public.sync_task_progress_from_status();

-- Sửa các bản ghi đã lệch trước khi bật lại constraint.
update public.task
set tien_do_thuc_te = case
  when trang_thai = 'todo' then 0
  when trang_thai = 'in_progress' then
    case
      when tien_do_thuc_te > 0 and tien_do_thuc_te < 100 then tien_do_thuc_te
      else 1
    end
  when trang_thai in ('review', 'done') then 100
  else tien_do_thuc_te
end
where
  (trang_thai = 'todo' and tien_do_thuc_te <> 0)
  or (trang_thai = 'in_progress' and (tien_do_thuc_te <= 0 or tien_do_thuc_te >= 100))
  or (trang_thai in ('review', 'done') and tien_do_thuc_te <> 100);

alter table public.task
drop constraint if exists task_approval_progress_consistent;

alter table public.task
add constraint task_approval_progress_consistent check (
  (trang_thai = 'todo' and tien_do_thuc_te = 0)
  or (trang_thai = 'in_progress' and tien_do_thuc_te > 0 and tien_do_thuc_te < 100)
  or (trang_thai in ('review', 'done') and tien_do_thuc_te = 100)
);

comment on function public.sync_task_progress_from_status() is
  'Đồng bộ tiến độ Task theo trạng thái: todo=0, in_progress=1..99, review/done=100.';


-- ===== 20260803000200_task_activity_log.sql =====
-- Nhat ky hoat dong Task: tao, xac nhan nhan, doi trang thai (bat dau/lam lai/hoan thanh),
-- bao cao tien do, duyet va chinh sua. Ghi bang trigger o tang database (khong phai o tang
-- API) de bat duoc moi luong ghi truc tiep/RPC, cung triet ly voi sync_task_progress_from_status.

create table if not exists public.task_hoat_dong (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task(id) on delete cascade,
  loai text not null check (loai in (
    'created', 'accepted', 'status_changed', 'progress_reported', 'approved', 'edited'
  )),
  tac_gia_id uuid references public.tai_khoan(id) on delete set null,
  tieu_de text not null,
  chi_tiet jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Truy van luon la "toan bo su kien cua 1 task, moi nhat truoc" -> index dung thu tu nay.
create index if not exists task_hoat_dong_task_created_idx
  on public.task_hoat_dong (task_id, created_at desc);

alter table public.task_hoat_dong enable row level security;

drop policy if exists task_hoat_dong_authenticated on public.task_hoat_dong;
create policy task_hoat_dong_authenticated
  on public.task_hoat_dong for all to authenticated using (true) with check (true);

comment on table public.task_hoat_dong is
  'Nhat ky hoat dong cua Task: tao, xac nhan, doi trang thai, bao cao, duyet, sua.';

-- Tra ve tai_khoan.id ung voi nguoi dang goi request hien tai (dung trong cac trigger duoi day).
create or replace function public.current_tai_khoan_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.tai_khoan where auth_user_id = auth.uid();
$$;

revoke execute on function public.current_tai_khoan_id() from public, anon, authenticated;

-- Task duoc tao / doi trang thai / sua noi dung.
create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  actor := public.current_tai_khoan_id();

  if tg_op = 'INSERT' then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'created', actor, 'Task được tạo', jsonb_build_object('trang_thai', new.trang_thai));
    return new;
  end if;

  if new.trang_thai is distinct from old.trang_thai then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (
      new.id,
      case when new.trang_thai = 'done' then 'approved' else 'status_changed' end,
      actor,
      case new.trang_thai
        when 'in_progress' then 'Task chuyển sang Đang làm'
        when 'review' then 'Task báo cáo hoàn tất, chờ duyệt'
        when 'done' then 'Task đã được duyệt hoàn thành'
        else 'Task được đưa về Chưa bắt đầu'
      end,
      jsonb_build_object('tu', old.trang_thai, 'den', new.trang_thai)
    );
  elsif new.tien_do_thuc_te is distinct from old.tien_do_thuc_te
    or new.ten_task is distinct from old.ten_task
    or new.mo_ta is distinct from old.mo_ta
    or new.ngay_bat_dau is distinct from old.ngay_bat_dau
    or new.ngay_ket_thuc is distinct from old.ngay_ket_thuc
    or new.uu_tien is distinct from old.uu_tien
    or new.nguoi_phu_trach_id is distinct from old.nguoi_phu_trach_id then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'edited', actor, 'Task được chỉnh sửa', jsonb_build_object('tien_do', new.tien_do_thuc_te));
  end if;

  return new;
end;
$$;

drop trigger if exists task_log_activity on public.task;
create trigger task_log_activity
after insert or update on public.task
for each row execute function public.log_task_activity();

revoke execute on function public.log_task_activity() from public, anon, authenticated;

-- Nguoi duoc giao xac nhan nhan Task (task_phu_trach.xac_nhan_luc chuyen tu null sang co gia tri).
create or replace function public.log_task_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.xac_nhan_luc is not null and old.xac_nhan_luc is null then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.task_id, 'accepted', new.tai_khoan_id, 'Người thực hiện xác nhận nhận Task', '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists task_phu_trach_log_acceptance on public.task_phu_trach;
create trigger task_phu_trach_log_acceptance
after update of xac_nhan_luc on public.task_phu_trach
for each row execute function public.log_task_acceptance();

revoke execute on function public.log_task_acceptance() from public, anon, authenticated;

-- Bao cao tien do moi gui cho Task.
create or replace function public.log_task_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
  values (
    new.task_id,
    'progress_reported',
    new.nguoi_bao_cao_id,
    'Báo cáo tiến độ mới: ' || coalesce(new.tien_do, 0) || '%',
    jsonb_build_object('tien_do', new.tien_do)
  );
  return new;
end;
$$;

drop trigger if exists bao_cao_task_log_activity on public.bao_cao_task;
create trigger bao_cao_task_log_activity
after insert on public.bao_cao_task
for each row execute function public.log_task_report();

revoke execute on function public.log_task_report() from public, anon, authenticated;

-- ===== 20260808000100_add_task_update_entries.sql =====
alter table public.cong_viec
  add column if not exists cap_nhat_bo_sung jsonb not null default '[]'::jsonb;

comment on column public.cong_viec.cap_nhat_bo_sung is
  'Cac lan bo sung mo ta + dinh kem sau lan dau, dang [{"id":"...","description":"...","images":[...],"files":[...],"links":[...],"createdAt":"..."}].';

-- ===== 20260808000200_add_subtask_update_entries.sql =====
alter table public.task
  add column if not exists cap_nhat_bo_sung jsonb not null default '[]'::jsonb;

comment on column public.task.cap_nhat_bo_sung is
  'Cac lan bo sung mo ta va dinh kem cua Task tu lan 2 tro di.';

comment on column public.cong_viec.cap_nhat_bo_sung is
  'Cot cu duoc giu lai de tranh mat du lieu; ung dung khong con su dung.';

-- ===== 20260811000100_add_subtask_creator.sql =====
alter table public.task
  add column if not exists nguoi_tao_id uuid references public.tai_khoan(id) on delete set null;

-- Dữ liệu cũ không lưu người tạo; dùng người phụ trách chính làm giá trị gần đúng
-- để cột mới không bị trống. Task tạo mới sẽ lưu đúng tài khoản đang thao tác.
update public.task
set nguoi_tao_id = nguoi_phu_trach_id
where nguoi_tao_id is null
  and nguoi_phu_trach_id is not null;

create index if not exists task_nguoi_tao_idx
  on public.task(nguoi_tao_id);

comment on column public.task.nguoi_tao_id is 'Tài khoản đã tạo Task.';

-- ===== 20260812000100_subtask_tester_qa_flow.sql =====
-- Luồng QA cho Task con: người thực hiện -> tester -> admin duyệt.

alter table public.task
  add column if not exists nguoi_test_id uuid references public.tai_khoan(id) on delete set null,
  add column if not exists ghi_chu_test text;

create index if not exists task_nguoi_test_idx on public.task(nguoi_test_id);

alter table public.task drop constraint if exists task_trang_thai_check;
alter table public.task
  add constraint task_trang_thai_check
  check (trang_thai in ('todo', 'in_progress', 'testing', 'review', 'done'));

create or replace function public.sync_task_progress_from_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.trang_thai is distinct from old.trang_thai then
    new.tien_do_thuc_te := case
      when new.trang_thai = 'todo' then 0
      when new.trang_thai = 'in_progress' then
        case
          when new.tien_do_thuc_te > 0 and new.tien_do_thuc_te < 100 then new.tien_do_thuc_te
          else 1
        end
      when new.trang_thai in ('testing', 'review', 'done') then 100
      else new.tien_do_thuc_te
    end;
  end if;
  return new;
end;
$$;

alter table public.task drop constraint if exists task_approval_progress_consistent;
alter table public.task
  add constraint task_approval_progress_consistent check (
    (trang_thai = 'todo' and tien_do_thuc_te = 0)
    or (trang_thai = 'in_progress' and tien_do_thuc_te > 0 and tien_do_thuc_te < 100)
    or (trang_thai in ('testing', 'review', 'done') and tien_do_thuc_te = 100)
  );

comment on column public.task.nguoi_test_id is 'Tài khoản được giao kiểm thử Task trước bước admin duyệt.';
comment on column public.task.ghi_chu_test is 'Ghi chú của lần kiểm thử fail gần nhất.';
comment on function public.sync_task_progress_from_status() is
  'Đồng bộ tiến độ Task: todo=0, in_progress=1..99, testing/review/done=100.';

alter table public.thong_bao drop constraint if exists thong_bao_loai_check;
alter table public.thong_bao
  add constraint thong_bao_loai_check
  check (loai in ('task_assigned', 'task_needs_testing', 'task_test_failed'));

create or replace function public.tao_thong_bao_qa_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trang_thai = 'testing'
     and old.trang_thai is distinct from 'testing'
     and new.nguoi_test_id is not null then
    insert into public.thong_bao(tai_khoan_id, loai, tieu_de, noi_dung, task_id)
    values (
      new.nguoi_test_id,
      'task_needs_testing',
      'Bạn có Task cần test',
      'Task “' || coalesce(new.ten_task, 'Chưa đặt tên') || '” đang chờ bạn kiểm thử.',
      new.id
    );
  elsif old.trang_thai = 'testing'
        and new.trang_thai = 'in_progress'
        and new.nguoi_phu_trach_id is not null then
    insert into public.thong_bao(tai_khoan_id, loai, tieu_de, noi_dung, task_id)
    values (
      new.nguoi_phu_trach_id,
      'task_test_failed',
      'Task chưa đạt kiểm thử',
      'Task “' || coalesce(new.ten_task, 'Chưa đặt tên') || '” cần sửa: ' || coalesce(new.ghi_chu_test, 'Chưa có ghi chú.'),
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists task_notify_qa_status on public.task;
create trigger task_notify_qa_status
after update of trang_thai on public.task
for each row execute function public.tao_thong_bao_qa_task();

revoke execute on function public.tao_thong_bao_qa_task() from public, anon, authenticated;

-- Ghi đúng nhãn trạng thái mới vào timeline hoạt động.
create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  actor := public.current_tai_khoan_id();
  if tg_op = 'INSERT' then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'created', actor, 'Task được tạo', jsonb_build_object('trang_thai', new.trang_thai));
    return new;
  end if;

  if new.trang_thai is distinct from old.trang_thai then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (
      new.id,
      case when new.trang_thai = 'done' then 'approved' else 'status_changed' end,
      actor,
      case new.trang_thai
        when 'in_progress' then 'Task chuyển sang Đang làm'
        when 'testing' then 'Task báo cáo hoàn tất, chờ test'
        when 'review' then 'Task đã Pass test, chờ duyệt'
        when 'done' then 'Task đã được duyệt hoàn thành'
        else 'Task được đưa về Chưa bắt đầu'
      end,
      jsonb_build_object('tu', old.trang_thai, 'den', new.trang_thai)
    );
  elsif new.tien_do_thuc_te is distinct from old.tien_do_thuc_te
    or new.ten_task is distinct from old.ten_task
    or new.mo_ta is distinct from old.mo_ta
    or new.ngay_bat_dau is distinct from old.ngay_bat_dau
    or new.ngay_ket_thuc is distinct from old.ngay_ket_thuc
    or new.uu_tien is distinct from old.uu_tien
    or new.nguoi_phu_trach_id is distinct from old.nguoi_phu_trach_id
    or new.nguoi_test_id is distinct from old.nguoi_test_id then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'edited', actor, 'Task được chỉnh sửa', jsonb_build_object('tien_do', new.tien_do_thuc_te));
  end if;
  return new;
end;
$$;

revoke execute on function public.log_task_activity() from public, anon, authenticated;

-- ===== 20260812000200_subtask_test_history.sql =====
-- Lưu riêng từng lần tester trả kết quả để không mất lịch sử khi Task được test lại.

create table if not exists public.task_lich_su_test (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task(id) on delete cascade,
  nguoi_test_id uuid references public.tai_khoan(id) on delete set null,
  ket_qua text not null check (ket_qua in ('passed', 'failed')),
  ghi_chu text,
  created_at timestamptz not null default now()
);

create index if not exists task_lich_su_test_task_created_idx
  on public.task_lich_su_test (task_id, created_at desc);

alter table public.task_lich_su_test enable row level security;

drop policy if exists task_lich_su_test_authenticated on public.task_lich_su_test;
create policy task_lich_su_test_authenticated
  on public.task_lich_su_test for all to authenticated using (true) with check (true);

comment on table public.task_lich_su_test is
  'Lịch sử từng lần kiểm thử Task: Pass/Fail, tester và ghi chú lỗi.';

create or replace function public.luu_lich_su_test_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.trang_thai = 'testing'
     and new.trang_thai in ('review', 'in_progress') then
    insert into public.task_lich_su_test (task_id, nguoi_test_id, ket_qua, ghi_chu)
    values (
      new.id,
      public.current_tai_khoan_id(),
      case when new.trang_thai = 'review' then 'passed' else 'failed' end,
      case when new.trang_thai = 'in_progress' then new.ghi_chu_test else null end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists task_save_test_history on public.task;
create trigger task_save_test_history
after update of trang_thai on public.task
for each row execute function public.luu_lich_su_test_task();

revoke execute on function public.luu_lich_su_test_task() from public, anon, authenticated;

-- ===== 20260813000100_truc_nhat.sql =====
-- Chuc nang Truc nhat: giao lich truc cho nhan vien.
-- Co che "lich ao + chot cu the":
--   - truc_nhat_lich_lap la quy tac lap theo thu trong tuan (mau mac dinh).
--   - truc_nhat_ca la ban ghi da "chot" cho 1 ngay cu the (ngay_truc unique).
--     Ngay nao chua co truc_nhat_ca thi tang service se tinh "ao" tu quy tac
--     lap dang hieu luc, khong luu DB. Khi admin sua rieng 1 ngay hoac nhan
--     vien tick 1 dau viec, ngay do se duoc "chot" (insert truc_nhat_ca that).

create table if not exists public.truc_nhat_dau_viec_mau (
  id uuid primary key default gen_random_uuid(),
  ten text not null,
  mo_ta text,
  thu_tu smallint not null default 0,
  dang_hoat_dong boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.truc_nhat_lich_lap (
  id uuid primary key default gen_random_uuid(),
  thu_trong_tuan smallint not null check (thu_trong_tuan between 1 and 7),
  ngay_bat_dau date not null,
  ngay_ket_thuc date,
  ghi_chu text,
  dang_hoat_dong boolean not null default true,
  created_by uuid references public.tai_khoan(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truc_nhat_lich_lap_thoi_gian_hop_le check (
    ngay_ket_thuc is null or ngay_ket_thuc >= ngay_bat_dau
  )
);

create table if not exists public.truc_nhat_lich_lap_phu_trach (
  lich_lap_id uuid not null references public.truc_nhat_lich_lap(id) on delete cascade,
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  la_chinh boolean not null default false,
  primary key (lich_lap_id, tai_khoan_id)
);

create table if not exists public.truc_nhat_ca (
  id uuid primary key default gen_random_uuid(),
  ngay_truc date not null unique,
  nguon text not null default 'thu_cong' check (nguon in ('lap_lich', 'thu_cong')),
  lich_lap_id uuid references public.truc_nhat_lich_lap(id) on delete set null,
  trang_thai text not null default 'chua_thuc_hien'
    check (trang_thai in ('chua_thuc_hien', 'dang_thuc_hien', 'hoan_thanh')),
  ghi_chu text,
  created_by uuid references public.tai_khoan(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.truc_nhat_ca_phu_trach (
  ca_id uuid not null references public.truc_nhat_ca(id) on delete cascade,
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  la_chinh boolean not null default false,
  phan_cong_luc timestamptz not null default now(),
  primary key (ca_id, tai_khoan_id)
);

create table if not exists public.truc_nhat_ca_dau_viec (
  id uuid primary key default gen_random_uuid(),
  ca_id uuid not null references public.truc_nhat_ca(id) on delete cascade,
  dau_viec_mau_id uuid references public.truc_nhat_dau_viec_mau(id) on delete set null,
  ten text not null,
  thu_tu smallint not null default 0,
  hoan_thanh boolean not null default false,
  hoan_thanh_luc timestamptz,
  hoan_thanh_boi uuid references public.tai_khoan(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists truc_nhat_lich_lap_created_by_idx
  on public.truc_nhat_lich_lap(created_by);
create index if not exists truc_nhat_lich_lap_thu_idx
  on public.truc_nhat_lich_lap(thu_trong_tuan) where dang_hoat_dong;
create index if not exists truc_nhat_lich_lap_phu_trach_tai_khoan_idx
  on public.truc_nhat_lich_lap_phu_trach(tai_khoan_id);
create index if not exists truc_nhat_ca_lich_lap_idx
  on public.truc_nhat_ca(lich_lap_id);
create index if not exists truc_nhat_ca_created_by_idx
  on public.truc_nhat_ca(created_by);
create index if not exists truc_nhat_ca_phu_trach_tai_khoan_idx
  on public.truc_nhat_ca_phu_trach(tai_khoan_id);
create index if not exists truc_nhat_ca_dau_viec_ca_idx
  on public.truc_nhat_ca_dau_viec(ca_id);
create index if not exists truc_nhat_ca_dau_viec_mau_idx
  on public.truc_nhat_ca_dau_viec(dau_viec_mau_id);

drop trigger if exists set_truc_nhat_dau_viec_mau_updated_at on public.truc_nhat_dau_viec_mau;
create trigger set_truc_nhat_dau_viec_mau_updated_at
before update on public.truc_nhat_dau_viec_mau
for each row execute function public.set_updated_at();

drop trigger if exists set_truc_nhat_lich_lap_updated_at on public.truc_nhat_lich_lap;
create trigger set_truc_nhat_lich_lap_updated_at
before update on public.truc_nhat_lich_lap
for each row execute function public.set_updated_at();

drop trigger if exists set_truc_nhat_ca_updated_at on public.truc_nhat_ca;
create trigger set_truc_nhat_ca_updated_at
before update on public.truc_nhat_ca
for each row execute function public.set_updated_at();

drop trigger if exists set_truc_nhat_ca_dau_viec_updated_at on public.truc_nhat_ca_dau_viec;
create trigger set_truc_nhat_ca_dau_viec_updated_at
before update on public.truc_nhat_ca_dau_viec
for each row execute function public.set_updated_at();

alter table public.truc_nhat_dau_viec_mau enable row level security;
alter table public.truc_nhat_lich_lap enable row level security;
alter table public.truc_nhat_lich_lap_phu_trach enable row level security;
alter table public.truc_nhat_ca enable row level security;
alter table public.truc_nhat_ca_phu_trach enable row level security;
alter table public.truc_nhat_ca_dau_viec enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'truc_nhat_dau_viec_mau',
    'truc_nhat_lich_lap',
    'truc_nhat_lich_lap_phu_trach',
    'truc_nhat_ca',
    'truc_nhat_ca_phu_trach',
    'truc_nhat_ca_dau_viec'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      table_name || '_authenticated',
      table_name
    );
  end loop;
end;
$$;

comment on table public.truc_nhat_dau_viec_mau is
  'Danh sach dau viec mau dung khi chot lich truc cho 1 ngay cu the.';
comment on table public.truc_nhat_lich_lap is
  'Quy tac lich truc lap lai theo thu trong tuan (1=Thu 2 ... 7=Chu nhat).';
comment on table public.truc_nhat_lich_lap_phu_trach is
  'Nhan vien duoc gan cho 1 quy tac lich lap; la_chinh danh dau nguoi truc chinh.';
comment on table public.truc_nhat_ca is
  'Ca truc da chot cho 1 ngay cu the (ngay_truc unique). nguon = lap_lich neu sinh tu quy tac lap chua bi sua, thu_cong neu admin ghi de rieng ngay do.';
comment on table public.truc_nhat_ca_phu_trach is
  'Nhan vien duoc phan cong cho 1 ca truc cu the.';
comment on table public.truc_nhat_ca_dau_viec is
  'Checklist dau viec cua 1 ca truc cu the, sao chep ten tu dau_viec_mau tai thoi diem chot de khong bi anh huong khi sua mau sau nay.';

-- ===== 20260907000100_add_subtask_prompt_items.sql =====
alter table public.task
  add column if not exists prompt_items jsonb not null default '[]'::jsonb;

comment on column public.task.prompt_items is
  'Danh sach yeu cau va URL anh dung de ghep Prompt trong trang chi tiet Task.';

-- ===== 20260910000100_skip_work_task_sync_on_cascade_delete.sql =====
-- Khi xóa công việc, CASCADE xóa task con và mỗi task kích hoạt sync trạng thái
-- parent đã bị xóa → cập nhật vô ích, làm DELETE chậm. Bỏ qua nếu parent không còn.

create or replace function public.sync_cong_viec_status_after_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.cong_viec where id = old.cong_viec_id) then
      update public.cong_viec
      set trang_thai = public.derive_cong_viec_status(old.cong_viec_id)
      where id = old.cong_viec_id;
    end if;
  elsif tg_op = 'INSERT' then
    update public.cong_viec
    set trang_thai = public.derive_cong_viec_status(new.cong_viec_id)
    where id = new.cong_viec_id;
  else
    update public.cong_viec
    set trang_thai = public.derive_cong_viec_status(new.cong_viec_id)
    where id = new.cong_viec_id;

    if new.cong_viec_id is distinct from old.cong_viec_id then
      update public.cong_viec
      set trang_thai = public.derive_cong_viec_status(old.cong_viec_id)
      where id = old.cong_viec_id;
    end if;
  end if;

  return null;
end;
$$;

-- ===== 20260913000100_add_subtask_issue_entries.sql =====
alter table public.task
  add column if not exists van_de_giai_phap jsonb not null default '[]'::jsonb;

comment on column public.task.van_de_giai_phap is
  'Danh sach van de va giai phap cua Task (moi dong: id, problem, solution).';

-- ===== 20260925000100_add_subtask_handover.sql =====

-- ===== 20260926000100_subtask_time_records.sql =====
alter table public.task
  add column if not exists time_records jsonb not null default '[]'::jsonb;

comment on column public.task.time_records is
  'Cac moc thoi gian xu ly Task duoc ghi nhan thu cong (start, pause, end).';

create or replace function public.append_task_time_record(
  p_task_id uuid,
  p_type text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_records jsonb;
  v_last_type text;
  v_record jsonb;
begin
  if p_type not in ('start', 'pause', 'end') then
    raise exception 'Invalid time record type' using errcode = '22023';
  end if;

  select coalesce(time_records, '[]'::jsonb)
    into v_records
    from public.task
    where id = p_task_id
    for update;

  if not found then
    return null;
  end if;

  if jsonb_typeof(v_records) <> 'array' then
    v_records := '[]'::jsonb;
  end if;

  v_last_type := v_records -> -1 ->> 'type';
  if (p_type = 'start' and v_last_type not in ('pause', 'end') and v_last_type is not null)
    or (p_type = 'pause' and v_last_type is distinct from 'start')
    or (p_type = 'end' and (v_last_type is null or v_last_type not in ('start', 'pause'))) then
    raise exception 'Invalid time record transition' using errcode = '22023';
  end if;

  v_record := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', p_type,
    'at', clock_timestamp(),
    'actorId', p_actor_id
  );
  v_records := v_records || jsonb_build_array(v_record);

  update public.task set time_records = v_records where id = p_task_id;
  return v_records;
end;
$$;

revoke execute on function public.append_task_time_record(uuid, text, uuid) from public, anon;
grant execute on function public.append_task_time_record(uuid, text, uuid) to authenticated;

-- ===== 20260926000200_employee_work_schedule.sql =====
create table if not exists public.nhan_vien_lich_lam_viec (
  id uuid primary key default gen_random_uuid(),
  nhan_vien_id uuid not null references public.tai_khoan(id) on delete cascade,
  ngay date not null,
  gio_bat_dau time not null,
  gio_ket_thuc time not null,
  ghi_chu text,
  nguoi_tao_id uuid references public.tai_khoan(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint nhan_vien_lich_gio_hop_le check (gio_ket_thuc > gio_bat_dau),
  constraint nhan_vien_lich_ghi_chu_hop_le check (ghi_chu is null or char_length(ghi_chu) <= 1000)
);

create index if not exists nhan_vien_lich_lam_viec_nhan_vien_ngay_idx
  on public.nhan_vien_lich_lam_viec (nhan_vien_id, ngay, gio_bat_dau);

alter table public.nhan_vien_lich_lam_viec enable row level security;

drop policy if exists nhan_vien_lich_lam_viec_authenticated
  on public.nhan_vien_lich_lam_viec;
create policy nhan_vien_lich_lam_viec_authenticated
  on public.nhan_vien_lich_lam_viec for all to authenticated
  using (true) with check (true);

grant select, insert on public.nhan_vien_lich_lam_viec to authenticated;

comment on table public.nhan_vien_lich_lam_viec is
  'Lich lam viec theo ngay, gio bat dau, gio ket thuc va ghi chu cua tung nhan vien.';

-- ===== 20260926000300_employee_attendance.sql =====
create table if not exists public.nhan_vien_cham_cong (
  id uuid primary key default gen_random_uuid(),
  nhan_vien_id uuid not null references public.tai_khoan(id) on delete cascade,
  ngay date not null,
  gio_checkin time,
  gio_checkout time,
  nguoi_cap_nhat_id uuid references public.tai_khoan(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nhan_vien_cham_cong_nhan_vien_ngay_key unique (nhan_vien_id, ngay),
  constraint nhan_vien_cham_cong_gio_hop_le check (
    gio_checkin is null or gio_checkout is null or gio_checkout >= gio_checkin
  )
);

create index if not exists nhan_vien_cham_cong_ngay_idx
  on public.nhan_vien_cham_cong (ngay desc, nhan_vien_id);

alter table public.nhan_vien_cham_cong enable row level security;

drop policy if exists nhan_vien_cham_cong_authenticated
  on public.nhan_vien_cham_cong;
create policy nhan_vien_cham_cong_authenticated
  on public.nhan_vien_cham_cong for all to authenticated
  using (true) with check (true);

grant select, insert, update on public.nhan_vien_cham_cong to authenticated;

comment on table public.nhan_vien_cham_cong is
  'Ghi nhận ngày và giờ check-in, check-out của nhân viên.';

-- ===== 20260927000100_attendance_overnight.sql =====
-- Cho phep ca qua dem: check-out co the nho hon check-in (sang hom sau).
-- Bang chi luu gio (time) nen khong the dung CHECK gio_checkout >= gio_checkin nua.
alter table if exists public.nhan_vien_cham_cong
  drop constraint if exists nhan_vien_cham_cong_gio_hop_le;

comment on table public.nhan_vien_cham_cong is
  'Ghi nhận ngày và giờ check-in, check-out của nhân viên. Nếu giờ check-out nhỏ hơn giờ check-in thì được hiểu là ca qua đêm (sáng hôm sau).';

-- ===== 20260927000200_task_activity_notes.sql =====
alter table public.task_hoat_dong
  drop constraint if exists task_hoat_dong_loai_check;

alter table public.task_hoat_dong
  add constraint task_hoat_dong_loai_check
  check (loai in (
    'created', 'accepted', 'status_changed', 'progress_reported', 'approved', 'edited', 'note'
  ));

comment on column public.task_hoat_dong.chi_tiet is
  'Chi tiet su kien Task; ghi chu thu cong luu noi_dung trong JSON.';

drop policy if exists task_hoat_dong_authenticated on public.task_hoat_dong;
drop policy if exists task_hoat_dong_read_authenticated on public.task_hoat_dong;
create policy task_hoat_dong_read_authenticated
  on public.task_hoat_dong for select to authenticated using (true);

create or replace function public.append_task_activity_note(
  p_task_id uuid,
  p_result text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_note_id uuid;
begin
  v_actor_id := public.current_tai_khoan_id();
  select role into v_role from public.tai_khoan where id = v_actor_id;
  if v_actor_id is null or v_role is null then
    raise exception 'Activity author not found' using errcode = '42501';
  end if;

  if v_role = 'member'
    and not exists (
      select 1 from public.task
      where id = p_task_id and (nguoi_phu_trach_id = v_actor_id or nguoi_test_id = v_actor_id)
    )
    and not exists (
      select 1 from public.task_phu_trach
      where task_id = p_task_id and tai_khoan_id = v_actor_id
    ) then
    raise exception 'Task access denied' using errcode = '42501';
  end if;

  insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
  values (p_task_id, 'note', v_actor_id, p_result, jsonb_build_object('noi_dung', p_content))
  returning id into v_note_id;
  return v_note_id;
end;
$$;

create or replace function public.update_task_activity_note(
  p_task_id uuid,
  p_note_id uuid,
  p_result text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
begin
  v_actor_id := public.current_tai_khoan_id();
  select role into v_role from public.tai_khoan where id = v_actor_id;
  if v_actor_id is null or v_role is null then
    raise exception 'Activity author not found' using errcode = '42501';
  end if;

  if v_role = 'member'
    and not exists (
      select 1 from public.task
      where id = p_task_id and (nguoi_phu_trach_id = v_actor_id or nguoi_test_id = v_actor_id)
    )
    and not exists (
      select 1 from public.task_phu_trach
      where task_id = p_task_id and tai_khoan_id = v_actor_id
    ) then
    raise exception 'Task access denied' using errcode = '42501';
  end if;

  update public.task_hoat_dong
  set tieu_de = p_result, chi_tiet = jsonb_build_object('noi_dung', p_content)
  where id = p_note_id
    and task_id = p_task_id
    and loai = 'note'
    and (tac_gia_id = v_actor_id or v_role = 'admin');
  if not found then return null; end if;
  return p_note_id;
end;
$$;

revoke execute on function public.append_task_activity_note(uuid, text, text) from public, anon;
revoke execute on function public.update_task_activity_note(uuid, uuid, text, text) from public, anon;
grant execute on function public.append_task_activity_note(uuid, text, text) to authenticated;
grant execute on function public.update_task_activity_note(uuid, uuid, text, text) to authenticated;

-- ===== 20260928000100_attendance_task_detail.sql =====
-- Cham cong gan Task chi tiet + list viec chi tiet trong ngay.
-- Dong thoi go CHECK gio cu de cho phep ca qua dem (neu buoc truoc
-- chua chay, migration nay se xu ly luon — chi can chay 1 lan).
alter table if exists public.nhan_vien_cham_cong
  drop constraint if exists nhan_vien_cham_cong_gio_hop_le;

alter table if exists public.nhan_vien_cham_cong
  add column if not exists task_id uuid references public.task(id) on delete set null,
  add column if not exists viec_chi_tiet text;

create index if not exists nhan_vien_cham_cong_task_idx
  on public.nhan_vien_cham_cong (task_id);

comment on column public.nhan_vien_cham_cong.task_id is
  'Task chi tiet nhan vien thuc hien trong ngay (tham chieu public.task).';
comment on column public.nhan_vien_cham_cong.viec_chi_tiet is
  'Danh sach viec chi tiet da lam trong ngay (nhap tu do).';

-- ===== 20260928000200_task_activity_note_assignee.sql =====
-- Ghi chu hoat dong Task: them Nguoi phu trach (tuy chon).
-- Luu trong chi_tiet JSON: nguoi_phu_trach_id + nguoi_phu_trach_ten (snapshot ten
-- tai thoi diem ghi, giong cach tac_gia hien thi ten). Dung default null nen cac
-- client cu goi 3 tham so van tuong thich.

drop function if exists public.append_task_activity_note(uuid, text, text);
drop function if exists public.update_task_activity_note(uuid, uuid, text, text);

create or replace function public.append_task_activity_note(
  p_task_id uuid,
  p_result text,
  p_content text,
  p_nguoi_phu_trach_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_ten text;
  v_note_id uuid;
begin
  v_actor_id := public.current_tai_khoan_id();
  select role into v_role from public.tai_khoan where id = v_actor_id;
  if v_actor_id is null or v_role is null then
    raise exception 'Activity author not found' using errcode = '42501';
  end if;

  if v_role = 'member'
    and not exists (
      select 1 from public.task
      where id = p_task_id and (nguoi_phu_trach_id = v_actor_id or nguoi_test_id = v_actor_id)
    )
    and not exists (
      select 1 from public.task_phu_trach
      where task_id = p_task_id and tai_khoan_id = v_actor_id
    ) then
    raise exception 'Task access denied' using errcode = '42501';
  end if;

  if p_nguoi_phu_trach_id is not null then
    select ten_nv into v_ten from public.tai_khoan where id = p_nguoi_phu_trach_id;
    if v_ten is null then
      raise exception 'Nguoi phu trach khong ton tai' using errcode = '23503';
    end if;
  end if;

  insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
  values (
    p_task_id,
    'note',
    v_actor_id,
    p_result,
    jsonb_build_object(
      'noi_dung', p_content,
      'nguoi_phu_trach_id', p_nguoi_phu_trach_id,
      'nguoi_phu_trach_ten', v_ten
    )
  )
  returning id into v_note_id;
  return v_note_id;
end;
$$;

create or replace function public.update_task_activity_note(
  p_task_id uuid,
  p_note_id uuid,
  p_result text,
  p_content text,
  p_nguoi_phu_trach_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_ten text;
begin
  v_actor_id := public.current_tai_khoan_id();
  select role into v_role from public.tai_khoan where id = v_actor_id;
  if v_actor_id is null or v_role is null then
    raise exception 'Activity author not found' using errcode = '42501';
  end if;

  if v_role = 'member'
    and not exists (
      select 1 from public.task
      where id = p_task_id and (nguoi_phu_trach_id = v_actor_id or nguoi_test_id = v_actor_id)
    )
    and not exists (
      select 1 from public.task_phu_trach
      where task_id = p_task_id and tai_khoan_id = v_actor_id
    ) then
    raise exception 'Task access denied' using errcode = '42501';
  end if;

  if p_nguoi_phu_trach_id is not null then
    select ten_nv into v_ten from public.tai_khoan where id = p_nguoi_phu_trach_id;
    if v_ten is null then
      raise exception 'Nguoi phu trach khong ton tai' using errcode = '23503';
    end if;
  end if;

  update public.task_hoat_dong
  set tieu_de = p_result,
    chi_tiet = jsonb_build_object(
      'noi_dung', p_content,
      'nguoi_phu_trach_id', p_nguoi_phu_trach_id,
      'nguoi_phu_trach_ten', v_ten
    )
  where id = p_note_id
    and task_id = p_task_id
    and loai = 'note'
    and (tac_gia_id = v_actor_id or v_role = 'admin');
  if not found then return null; end if;
  return p_note_id;
end;
$$;

revoke execute on function public.append_task_activity_note(uuid, text, text, uuid) from public, anon;
revoke execute on function public.update_task_activity_note(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.append_task_activity_note(uuid, text, text, uuid) to authenticated;
grant execute on function public.update_task_activity_note(uuid, uuid, text, text, uuid) to authenticated;

comment on column public.task_hoat_dong.chi_tiet is
  'Chi tiet su kien Task; ghi chu thu cong luu noi_dung + nguoi_phu_trach trong JSON.';

-- ===== 20260928000300_task_activity_attendance.sql =====
-- Timeline Task: them loai 'cham_cong' de tu dong ghi nhat ky
-- khi cham cong gan task (check-in / check-out moi).

alter table public.task_hoat_dong
  drop constraint if exists task_hoat_dong_loai_check;

alter table public.task_hoat_dong
  add constraint task_hoat_dong_loai_check
  check (loai in (
    'created', 'accepted', 'status_changed', 'progress_reported', 'approved', 'edited', 'note', 'cham_cong'
  ));

comment on table public.task_hoat_dong is
  'Nhat ky hoat dong cua Task: tao, xac nhan, doi trang thai, bao cao, duyet, sua, ghi chu, cham cong.';

-- ===== 20260928000400_task_activity_note_delete.sql =====
-- Cho phep xoa su kien trong timeline Task (ghi chu thu cong + su kien tu dong).
-- Chi tac gia hoac admin duoc xoa.

create or replace function public.delete_task_activity_note(
  p_task_id uuid,
  p_note_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
begin
  v_actor_id := public.current_tai_khoan_id();
  select role into v_role from public.tai_khoan where id = v_actor_id;
  if v_actor_id is null or v_role is null then
    raise exception 'Activity author not found' using errcode = '42501';
  end if;

  delete from public.task_hoat_dong
  where id = p_note_id
    and task_id = p_task_id
    and (tac_gia_id = v_actor_id or v_role = 'admin');
  if not found then return false; end if;
  return true;
end;
$$;

revoke execute on function public.delete_task_activity_note(uuid, uuid) from public, anon;
grant execute on function public.delete_task_activity_note(uuid, uuid) to authenticated;

-- ===== 20260928000500_task_activity_no_auto_status.sql =====
-- Bo log tu dong "doi trang thai" trong timeline Task (giam nhieu).
-- Chi giu: tao Task, duyet hoan thanh, chinh sua noi dung. Cac dong
-- status_changed cu van nam trong DB (xem cau lenh don dep ben duoi neu muon xoa).

create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  actor := public.current_tai_khoan_id();

  if tg_op = 'INSERT' then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'created', actor, 'Task được tạo', jsonb_build_object('trang_thai', new.trang_thai));
    return new;
  end if;

  if new.trang_thai is distinct from old.trang_thai then
    -- Chi ghi moc duyet hoan thanh; cac chuyen trang thai trung gian khong ghi nua.
    if new.trang_thai = 'done' then
      insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
      values (new.id, 'approved', actor, 'Task đã được duyệt hoàn thành', jsonb_build_object('tu', old.trang_thai, 'den', new.trang_thai));
    end if;
  elsif new.tien_do_thuc_te is distinct from old.tien_do_thuc_te
    or new.ten_task is distinct from old.ten_task
    or new.mo_ta is distinct from old.mo_ta
    or new.ngay_bat_dau is distinct from old.ngay_bat_dau
    or new.ngay_ket_thuc is distinct from old.ngay_ket_thuc
    or new.uu_tien is distinct from old.uu_tien
    or new.nguoi_phu_trach_id is distinct from old.nguoi_phu_trach_id then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'edited', actor, 'Task được chỉnh sửa', jsonb_build_object('tien_do', new.tien_do_thuc_te));
  end if;

  return new;
end;
$$;

-- Don dep (tuy chon, chay rieng khi muon xoa lich su doi trang thai cu):
-- delete from public.task_hoat_dong where loai = 'status_changed';

-- ===== 20261004000100_task_progress_from_prompts.sql =====
-- Tiến độ thực tế của Task do ứng dụng ghi theo trạng thái Prompt (0–100),
-- không còn bị ép theo trạng thái workflow.

create or replace function public.sync_task_progress_from_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  return new;
end;
$$;

alter table public.task drop constraint if exists task_approval_progress_consistent;

comment on function public.sync_task_progress_from_status() is
  'Không còn ghi đè tiến độ. Tiến độ thực tế được tính từ trạng thái Prompt.';

-- ===== 20261018000100_detail_time_sessions.sql =====
create or replace function public.append_task_detail_time_record(
  p_task_id uuid,
  p_type text,
  p_actor_id uuid,
  p_detail_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_records jsonb;
  v_last_type text;
  v_record jsonb;
  v_updates jsonb;
  v_handover text;
  v_deleted boolean := false;
begin
  if p_type not in ('start', 'pause', 'end') then
    raise exception 'Invalid time record type' using errcode = '22023';
  end if;

  select coalesce(time_records, '[]'::jsonb), cap_nhat_bo_sung, ban_giao_noi_dung
    into v_records, v_updates, v_handover
    from public.task
    where id = p_task_id
    for update;

  if not found then
    return null;
  end if;

  if jsonb_typeof(v_records) <> 'array' then
    v_records := '[]'::jsonb;
  end if;

  begin
    v_deleted := coalesce((v_handover::jsonb ->> 'initialDeleted')::boolean, false);
  exception when invalid_text_representation then
    v_deleted := false;
  end;
  if p_detail_id is null or (p_detail_id = 'initial' and v_deleted)
    or (p_detail_id <> 'initial' and not exists (
      select 1 from jsonb_array_elements(coalesce(v_updates, '[]'::jsonb)) item
      where item ->> 'id' = p_detail_id
    )) then
    raise exception 'Invalid task detail' using errcode = '22023';
  end if;

  select item ->> 'type' into v_last_type
    from jsonb_array_elements(v_records) with ordinality as records(item, position)
    where item ->> 'detailId' = p_detail_id
    order by position desc limit 1;
  if (p_type = 'start' and v_last_type not in ('pause', 'end') and v_last_type is not null)
    or (p_type = 'pause' and v_last_type is distinct from 'start')
    or (p_type = 'end' and (v_last_type is null or v_last_type not in ('start', 'pause'))) then
    raise exception 'Invalid time record transition' using errcode = '22023';
  end if;

  v_record := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', p_type,
    'detailId', p_detail_id,
    'at', clock_timestamp(),
    'actorId', p_actor_id
  );
  v_records := v_records || jsonb_build_array(v_record);

  update public.task set time_records = v_records where id = p_task_id;
  return v_records;
end;
$$;

revoke execute on function public.append_task_detail_time_record(uuid, text, uuid, text) from public, anon;
grant execute on function public.append_task_detail_time_record(uuid, text, uuid, text) to authenticated;

-- ===== 20261023000100_work_schedule_delete.sql =====
-- Restrict DELETE even though the existing permissive policy allows all operations.
create policy nhan_vien_lich_lam_viec_delete_managers
  on public.nhan_vien_lich_lam_viec as restrictive
  for delete to authenticated
  using (
    exists (
      select 1 from public.tai_khoan
      where auth_user_id = (select auth.uid())
        and status = 'active'
        and role in ('admin', 'manager')
    )
  );

grant delete on public.nhan_vien_lich_lam_viec to authenticated;

-- ===== 20261102000100_attendance_multiple_tasks.sql =====
-- Cham cong co the gan nhieu task trong cung mot ngay.
-- task_id van giu task dau tien de tuong thich du lieu cu (FK + timeline),
-- task_ids luu toan bo danh sach task da chon.

alter table if exists public.nhan_vien_cham_cong
  add column if not exists task_ids uuid[];

-- Chuyen du lieu cu (1 task) sang mang.
update public.nhan_vien_cham_cong
set task_ids = array[task_id]
where task_id is not null
  and (task_ids is null or cardinality(task_ids) = 0);

create index if not exists nhan_vien_cham_cong_task_ids_idx
  on public.nhan_vien_cham_cong using gin (task_ids);

comment on column public.nhan_vien_cham_cong.task_ids is
  'Danh sach task chi tiet nhan vien thuc hien trong ngay (tham chieu public.task).';

-- ===== 20261104000100_manual_task_detail_time.sql =====
create or replace function public.append_task_detail_time_record(
  p_task_id uuid,
  p_type text,
  p_actor_id uuid,
  p_detail_id text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_records jsonb;
  v_last_type text;
  v_record jsonb;
  v_updates jsonb;
  v_handover text;
  v_deleted boolean := false;
begin
  if p_type not in ('start', 'pause', 'end') then
    raise exception 'Invalid time record type' using errcode = '22023';
  end if;
  select coalesce(time_records, '[]'::jsonb), cap_nhat_bo_sung, ban_giao_noi_dung
    into v_records, v_updates, v_handover
    from public.task where id = p_task_id for update;
  if not found then return null; end if;
  if jsonb_typeof(v_records) <> 'array' then v_records := '[]'::jsonb; end if;
  begin
    v_deleted := coalesce((v_handover::jsonb ->> 'initialDeleted')::boolean, false);
  exception when invalid_text_representation then v_deleted := false;
  end;
  if p_detail_id is null or (p_detail_id = 'initial' and v_deleted)
    or (p_detail_id <> 'initial' and not exists (
      select 1 from jsonb_array_elements(coalesce(v_updates, '[]'::jsonb)) item
      where item ->> 'id' = p_detail_id
    )) then
    raise exception 'Invalid task detail' using errcode = '22023';
  end if;
  select item ->> 'type' into v_last_type
    from jsonb_array_elements(v_records) with ordinality as records(item, position)
    where item ->> 'detailId' = p_detail_id order by position desc limit 1;
  if (p_type = 'start' and v_last_type not in ('pause', 'end') and v_last_type is not null)
    or (p_type = 'pause' and v_last_type is distinct from 'start')
    or (p_type = 'end' and (v_last_type is null or v_last_type not in ('start', 'pause'))) then
    raise exception 'Invalid time record transition' using errcode = '22023';
  end if;
  v_record := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', p_type,
    'detailId', p_detail_id,
    'at', coalesce(p_at, clock_timestamp()),
    'actorId', p_actor_id
  );
  v_records := v_records || jsonb_build_array(v_record);
  update public.task set time_records = v_records where id = p_task_id;
  return v_records;
end;
$$;
revoke execute on function public.append_task_detail_time_record(uuid, text, uuid, text, timestamptz) from public, anon;
grant execute on function public.append_task_detail_time_record(uuid, text, uuid, text, timestamptz) to authenticated;

-- ===== 20261106000200_project_processes.sql =====
-- Nội dung hướng dẫn quy trình theo dự án, tách khỏi cấu hình trạng thái steps.
create table if not exists public.quy_trinh_du_an (
  id uuid primary key default gen_random_uuid(),
  du_an_id uuid not null references public.du_an(id) on delete cascade,
  tieu_de text not null check (char_length(tieu_de) between 1 and 200),
  mo_ta text not null default '',
  cac_buoc jsonb not null default '[]'::jsonb check (jsonb_typeof(cac_buoc) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quy_trinh_du_an_project_idx on public.quy_trinh_du_an(du_an_id, updated_at desc);
drop trigger if exists set_quy_trinh_du_an_updated_at on public.quy_trinh_du_an;
create trigger set_quy_trinh_du_an_updated_at before update on public.quy_trinh_du_an
for each row execute function public.set_updated_at();

alter table public.quy_trinh_du_an enable row level security;
create policy quy_trinh_du_an_read on public.quy_trinh_du_an for select to authenticated using (
  exists (
    select 1 from public.tai_khoan tk
    where tk.auth_user_id = auth.uid()
      and (tk.role in ('admin', 'manager')
        or exists (select 1 from public.du_an_thanh_vien tv where tv.du_an_id = quy_trinh_du_an.du_an_id and tv.tai_khoan_id = tk.id)
        or exists (select 1 from public.du_an_quan_ly ql where ql.du_an_id = quy_trinh_du_an.du_an_id and ql.tai_khoan_id = tk.id)
        or exists (select 1 from public.du_an da where da.id = quy_trinh_du_an.du_an_id and da.nguoi_ql_id = tk.id))
  )
);
create policy quy_trinh_du_an_write on public.quy_trinh_du_an for all to authenticated
using (exists (select 1 from public.tai_khoan tk where tk.auth_user_id = auth.uid() and tk.role in ('admin','manager')))
with check (exists (select 1 from public.tai_khoan tk where tk.auth_user_id = auth.uid() and tk.role in ('admin','manager')));
grant select, insert, update, delete on public.quy_trinh_du_an to authenticated;

-- ===== 20261106000300_project_process_cover_image.sql =====
-- Ảnh minh họa của quy trình (mục cha), độc lập với ảnh từng bước.
alter table public.quy_trinh_du_an
  add column if not exists anh_dai_dien text not null default '';

