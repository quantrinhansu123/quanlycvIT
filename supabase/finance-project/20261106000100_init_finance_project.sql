-- =====================================================================
-- Supabase TÀI CHÍNH (project qobjixzraumfpsexgazz)
-- Chạy toàn bộ file này trong SQL Editor của project tài chính.
-- Đây là schema độc lập: không phụ thuộc bảng tai_khoan của app chính.
-- App chỉ truy cập bằng service_role ở phía server, nên bật RLS và
-- không tạo policy cho anon/authenticated.
-- =====================================================================

create extension if not exists pgcrypto;

-- Hàm cập nhật updated_at dùng riêng cho project tài chính.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.thu_chi_danh_muc (
  id uuid primary key default gen_random_uuid(),
  ten text not null,
  loai text not null check (loai in ('thu', 'chi')),
  ngan_sach_thang numeric(14,2) check (ngan_sach_thang is null or ngan_sach_thang >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ten, loai)
);

create table if not exists public.thu_chi (
  id uuid primary key default gen_random_uuid(),
  loai text not null check (loai in ('thu', 'chi')),
  so_tien numeric(14,2) not null check (so_tien > 0),
  ngay date not null,
  danh_muc_id uuid not null references public.thu_chi_danh_muc(id) on delete restrict,
  mo_ta text,
  tep_hoa_don text,
  -- Giữ UUID người tạo từ app chính để đối chiếu; không đặt khóa ngoại
  -- vì bảng tai_khoan nằm ở project khác.
  nguoi_tao_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists thu_chi_ngay_idx on public.thu_chi(ngay);
create index if not exists thu_chi_danh_muc_id_idx on public.thu_chi(danh_muc_id);
create index if not exists thu_chi_loai_idx on public.thu_chi(loai);
create index if not exists thu_chi_ngay_loai_idx on public.thu_chi(ngay, loai);

drop trigger if exists set_thu_chi_updated_at on public.thu_chi;
create trigger set_thu_chi_updated_at
before update on public.thu_chi
for each row execute function public.set_updated_at();

drop trigger if exists set_thu_chi_danh_muc_updated_at on public.thu_chi_danh_muc;
create trigger set_thu_chi_danh_muc_updated_at
before update on public.thu_chi_danh_muc
for each row execute function public.set_updated_at();

-- Chặn giao dịch dùng sai loại danh mục (giống app chính).
create or replace function public.validate_thu_chi_category_type()
returns trigger
language plpgsql
as $$
declare
  category_type text;
begin
  select loai into category_type
  from public.thu_chi_danh_muc
  where id = new.danh_muc_id;

  if category_type is null then
    raise exception 'Danh mục không tồn tại.';
  end if;

  if category_type <> new.loai then
    raise exception 'Loại giao dịch không khớp với loại danh mục.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_thu_chi_category_type_before_write on public.thu_chi;
create trigger validate_thu_chi_category_type_before_write
before insert or update of loai, danh_muc_id on public.thu_chi
for each row execute function public.validate_thu_chi_category_type();

-- Tổng hợp theo ngày/loại, dùng cho dashboard tài chính.
create or replace function public.thu_chi_tong_hop(p_start date, p_end date)
returns table(ngay date, loai text, tong_tien numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.ngay, t.loai, sum(t.so_tien)
  from public.thu_chi t
  where t.ngay between p_start and p_end
  group by t.ngay, t.loai
  order by t.ngay, t.loai;
$$;

alter table public.thu_chi enable row level security;
alter table public.thu_chi_danh_muc enable row level security;

-- Chỉ server (service_role) được đọc/ghi; không mở cho anon/authenticated.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.thu_chi to service_role;
grant select, insert, update, delete on public.thu_chi_danh_muc to service_role;
grant execute on function public.thu_chi_tong_hop(date, date) to service_role;

comment on table public.thu_chi_danh_muc is 'Danh mục thu chi - Supabase tài chính.';
comment on table public.thu_chi is 'Giao dịch thu chi - Supabase tài chính.';
