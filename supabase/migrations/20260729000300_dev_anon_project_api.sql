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
