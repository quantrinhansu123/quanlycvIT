-- Quyen phat trien cho man hinh Phong ban & Chuc vu khi ung dung chua co dang nhap.
-- Khi bat Supabase Auth o production, xoa policy anon nay.
alter table public.phong_ban enable row level security;

drop policy if exists phong_ban_select_anon_dev on public.phong_ban;
drop policy if exists phong_ban_manage_anon_dev on public.phong_ban;
create policy phong_ban_manage_anon_dev
on public.phong_ban for all to anon
using (true) with check (true);

grant select, insert, update, delete on public.phong_ban to anon;
