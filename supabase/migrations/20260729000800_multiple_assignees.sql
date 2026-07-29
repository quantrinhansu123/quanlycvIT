-- Mot cong viec / task co the co nhieu nguoi phu trach.
-- Rang buoc nghiep vu:
--   - Nguoi phu trach cong viec phai tham gia du an cua cong viec do.
--   - Nguoi phu trach task phai nam trong nhom phu trach cong viec cha.
-- Cot nguoi_phu_trach_id cu duoc giu lam nguoi phu trach chinh de tuong thich.

create table if not exists public.cong_viec_phu_trach (
  cong_viec_id uuid not null references public.cong_viec(id) on delete cascade,
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  la_chinh boolean not null default false,
  phan_cong_luc timestamptz not null default now(),
  primary key (cong_viec_id, tai_khoan_id)
);

create table if not exists public.task_phu_trach (
  task_id uuid not null references public.task(id) on delete cascade,
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  la_chinh boolean not null default false,
  phan_cong_luc timestamptz not null default now(),
  primary key (task_id, tai_khoan_id)
);

create index if not exists cong_viec_phu_trach_tai_khoan_idx
  on public.cong_viec_phu_trach(tai_khoan_id);
create index if not exists task_phu_trach_tai_khoan_idx
  on public.task_phu_trach(tai_khoan_id);

-- 1. Chuyen nguoi phu trach hien tai sang bang moi, danh dau la nguoi chinh.
insert into public.cong_viec_phu_trach (cong_viec_id, tai_khoan_id, la_chinh)
select id, nguoi_phu_trach_id, true
from public.cong_viec
where nguoi_phu_trach_id is not null
on conflict (cong_viec_id, tai_khoan_id) do update
set la_chinh = excluded.la_chinh;

insert into public.task_phu_trach (task_id, tai_khoan_id, la_chinh)
select id, nguoi_phu_trach_id, true
from public.task
where nguoi_phu_trach_id is not null
on conflict (task_id, tai_khoan_id) do update
set la_chinh = excluded.la_chinh;

-- 2. Nguoi phu trach task phai co trong nhom phu trach cong viec cha.
insert into public.cong_viec_phu_trach (cong_viec_id, tai_khoan_id, la_chinh)
select distinct t.cong_viec_id, tpt.tai_khoan_id, false
from public.task_phu_trach as tpt
join public.task as t on t.id = tpt.task_id
on conflict (cong_viec_id, tai_khoan_id) do nothing;

-- 3. Nguoi phu trach cong viec phai tham gia du an tuong ung.
insert into public.du_an_thanh_vien (du_an_id, tai_khoan_id)
select distinct cv.du_an_id, cvpt.tai_khoan_id
from public.cong_viec_phu_trach as cvpt
join public.cong_viec as cv on cv.id = cvpt.cong_viec_id
where not exists (
  select 1
  from public.du_an_quan_ly as dql
  where dql.du_an_id = cv.du_an_id
    and dql.tai_khoan_id = cvpt.tai_khoan_id
)
on conflict (du_an_id, tai_khoan_id) do nothing;

alter table public.cong_viec_phu_trach enable row level security;
alter table public.task_phu_trach enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['cong_viec_phu_trach', 'task_phu_trach']
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

    -- Quyen tam thoi cho giai doan phat trien chua co man hinh dang nhap.
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_all_anon_dev',
      table_name
    );
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      table_name || '_all_anon_dev',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete
  on public.cong_viec_phu_trach, public.task_phu_trach
  to anon, authenticated;

comment on table public.cong_viec_phu_trach is
  'Nhieu nguoi phu trach cua mot cong viec; chi gom nguoi tham gia du an cua cong viec.';
comment on table public.task_phu_trach is
  'Nhieu nguoi phu trach cua mot task; chi gom nguoi phu trach cong viec cha.';
