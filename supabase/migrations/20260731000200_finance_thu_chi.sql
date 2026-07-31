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
