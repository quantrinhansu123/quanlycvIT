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
