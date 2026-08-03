-- Nhat ky hoat dong Task: tao, xac nhan nhan, doi trang thai (bat dau/lam lai/hoan thanh),
-- bao cao tien do, duyet va chinh sua. Ghi bang trigger o tang database (khong phai o tang
-- API) de bat duoc moi luong ghi truc tiep/RPC, cung triet ly voi sync_task_progress_from_status.

create table if not exists public.task_hoat_dong (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task(id) on delete cascade,
  loai text not null check (loai in (
    'created', 'accepted', 'status_changed', 'progress_reported', 'approved', 'edited'
  )),
  tac_gia_id uuid references public.tai_khoan(id) on delete set null,
  tieu_de text not null,
  chi_tiet jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Truy van luon la "toan bo su kien cua 1 task, moi nhat truoc" -> index dung thu tu nay.
create index if not exists task_hoat_dong_task_created_idx
  on public.task_hoat_dong (task_id, created_at desc);

alter table public.task_hoat_dong enable row level security;

drop policy if exists task_hoat_dong_authenticated on public.task_hoat_dong;
create policy task_hoat_dong_authenticated
  on public.task_hoat_dong for all to authenticated using (true) with check (true);

comment on table public.task_hoat_dong is
  'Nhat ky hoat dong cua Task: tao, xac nhan, doi trang thai, bao cao, duyet, sua.';

-- Tra ve tai_khoan.id ung voi nguoi dang goi request hien tai (dung trong cac trigger duoi day).
create or replace function public.current_tai_khoan_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.tai_khoan where auth_user_id = auth.uid();
$$;

revoke execute on function public.current_tai_khoan_id() from public, anon, authenticated;

-- Task duoc tao / doi trang thai / sua noi dung.
create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  actor := public.current_tai_khoan_id();

  if tg_op = 'INSERT' then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'created', actor, 'Task được tạo', jsonb_build_object('trang_thai', new.trang_thai));
    return new;
  end if;

  if new.trang_thai is distinct from old.trang_thai then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (
      new.id,
      case when new.trang_thai = 'done' then 'approved' else 'status_changed' end,
      actor,
      case new.trang_thai
        when 'in_progress' then 'Task chuyển sang Đang làm'
        when 'review' then 'Task báo cáo hoàn tất, chờ duyệt'
        when 'done' then 'Task đã được duyệt hoàn thành'
        else 'Task được đưa về Chưa bắt đầu'
      end,
      jsonb_build_object('tu', old.trang_thai, 'den', new.trang_thai)
    );
  elsif new.tien_do_thuc_te is distinct from old.tien_do_thuc_te
    or new.ten_task is distinct from old.ten_task
    or new.mo_ta is distinct from old.mo_ta
    or new.ngay_bat_dau is distinct from old.ngay_bat_dau
    or new.ngay_ket_thuc is distinct from old.ngay_ket_thuc
    or new.uu_tien is distinct from old.uu_tien
    or new.nguoi_phu_trach_id is distinct from old.nguoi_phu_trach_id then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'edited', actor, 'Task được chỉnh sửa', jsonb_build_object('tien_do', new.tien_do_thuc_te));
  end if;

  return new;
end;
$$;

drop trigger if exists task_log_activity on public.task;
create trigger task_log_activity
after insert or update on public.task
for each row execute function public.log_task_activity();

revoke execute on function public.log_task_activity() from public, anon, authenticated;

-- Nguoi duoc giao xac nhan nhan Task (task_phu_trach.xac_nhan_luc chuyen tu null sang co gia tri).
create or replace function public.log_task_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.xac_nhan_luc is not null and old.xac_nhan_luc is null then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.task_id, 'accepted', new.tai_khoan_id, 'Người thực hiện xác nhận nhận Task', '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists task_phu_trach_log_acceptance on public.task_phu_trach;
create trigger task_phu_trach_log_acceptance
after update of xac_nhan_luc on public.task_phu_trach
for each row execute function public.log_task_acceptance();

revoke execute on function public.log_task_acceptance() from public, anon, authenticated;

-- Bao cao tien do moi gui cho Task.
create or replace function public.log_task_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
  values (
    new.task_id,
    'progress_reported',
    new.nguoi_bao_cao_id,
    'Báo cáo tiến độ mới: ' || coalesce(new.tien_do, 0) || '%',
    jsonb_build_object('tien_do', new.tien_do)
  );
  return new;
end;
$$;

drop trigger if exists bao_cao_task_log_activity on public.bao_cao_task;
create trigger bao_cao_task_log_activity
after insert on public.bao_cao_task
for each row execute function public.log_task_report();

revoke execute on function public.log_task_report() from public, anon, authenticated;
