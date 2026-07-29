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
