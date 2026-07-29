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
