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
