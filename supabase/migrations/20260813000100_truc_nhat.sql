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
