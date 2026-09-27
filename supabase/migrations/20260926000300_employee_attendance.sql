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
