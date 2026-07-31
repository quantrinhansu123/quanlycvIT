-- Moi nguoi duoc giao Task phai xac nhan truoc khi bat dau lam.
-- Cac phan cong cu duoc danh dau da xac nhan de khong lam thay doi luong dang su dung.
alter table public.task_phu_trach
  add column if not exists xac_nhan_luc timestamptz;

update public.task_phu_trach
set xac_nhan_luc = coalesce(xac_nhan_luc, phan_cong_luc, now());

comment on column public.task_phu_trach.xac_nhan_luc is
  'Thoi diem nhan vien xac nhan nhan Task; null nghia la dang cho xac nhan.';

create table if not exists public.thong_bao (
  id uuid primary key default gen_random_uuid(),
  tai_khoan_id uuid not null references public.tai_khoan(id) on delete cascade,
  loai text not null check (loai in ('task_assigned')),
  tieu_de text not null,
  noi_dung text not null,
  task_id uuid references public.task(id) on delete cascade,
  da_doc boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists thong_bao_tai_khoan_created_idx
  on public.thong_bao(tai_khoan_id, created_at desc);
create index if not exists thong_bao_tai_khoan_chua_doc_idx
  on public.thong_bao(tai_khoan_id, da_doc)
  where da_doc = false;

alter table public.thong_bao enable row level security;

drop policy if exists thong_bao_select_own on public.thong_bao;
create policy thong_bao_select_own
  on public.thong_bao
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tai_khoan tk
      where tk.id = thong_bao.tai_khoan_id
        and tk.auth_user_id = auth.uid()
    )
  );

drop policy if exists thong_bao_update_own on public.thong_bao;
create policy thong_bao_update_own
  on public.thong_bao
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tai_khoan tk
      where tk.id = thong_bao.tai_khoan_id
        and tk.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tai_khoan tk
      where tk.id = thong_bao.tai_khoan_id
        and tk.auth_user_id = auth.uid()
    )
  );

revoke all on public.thong_bao from anon;
revoke all on public.thong_bao from authenticated;
grant select on public.thong_bao to authenticated;
grant update (da_doc) on public.thong_bao to authenticated;

create or replace function public.tao_thong_bao_task_duoc_giao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_name text;
  work_task_name text;
begin
  select t.ten_task, cv.ten_cv
    into task_name, work_task_name
  from public.task t
  left join public.cong_viec cv on cv.id = t.cong_viec_id
  where t.id = new.task_id;

  insert into public.thong_bao (
    tai_khoan_id,
    loai,
    tieu_de,
    noi_dung,
    task_id
  )
  values (
    new.tai_khoan_id,
    'task_assigned',
    'Bạn được giao Task mới',
    case
      when work_task_name is not null then
        'Task “' || coalesce(task_name, 'Chưa đặt tên') || '” thuộc công việc “' || work_task_name || '”.'
      else
        'Bạn vừa được giao Task “' || coalesce(task_name, 'Chưa đặt tên') || '”.'
    end,
    new.task_id
  );

  return new;
end;
$$;

drop trigger if exists task_phu_trach_notify_assignee on public.task_phu_trach;
create trigger task_phu_trach_notify_assignee
after insert on public.task_phu_trach
for each row
execute function public.tao_thong_bao_task_duoc_giao();

revoke execute on function public.tao_thong_bao_task_duoc_giao() from public, anon, authenticated;

comment on table public.thong_bao is
  'Thong bao noi bo theo tung tai khoan, hien thi tai chuong tren thanh Header.';
