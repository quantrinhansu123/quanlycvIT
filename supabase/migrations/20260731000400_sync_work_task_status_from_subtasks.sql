-- Trạng thái Công việc là dữ liệu suy ra từ các Task con, không cập nhật thủ công.
-- Chỉ khi có ít nhất một Task và tất cả Task đều "done" thì Công việc mới "done".

create or replace function public.derive_cong_viec_status(p_cong_viec_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when count(*) = 0 then 'todo'
    when bool_and(t.trang_thai = 'done') then 'done'
    when bool_or(t.tien_do_thuc_te > 0 or t.trang_thai <> 'todo') then 'in_progress'
    else 'todo'
  end
  from public.task as t
  where t.cong_viec_id = p_cong_viec_id;
$$;

create or replace function public.enforce_cong_viec_derived_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.trang_thai := public.derive_cong_viec_status(new.id);
  return new;
end;
$$;

drop trigger if exists enforce_cong_viec_derived_status on public.cong_viec;
create trigger enforce_cong_viec_derived_status
before insert or update of trang_thai on public.cong_viec
for each row
execute function public.enforce_cong_viec_derived_status();

create or replace function public.sync_cong_viec_status_after_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.cong_viec
    set trang_thai = public.derive_cong_viec_status(old.cong_viec_id)
    where id = old.cong_viec_id;
  elsif tg_op = 'INSERT' then
    update public.cong_viec
    set trang_thai = public.derive_cong_viec_status(new.cong_viec_id)
    where id = new.cong_viec_id;
  else
    update public.cong_viec
    set trang_thai = public.derive_cong_viec_status(new.cong_viec_id)
    where id = new.cong_viec_id;

    if new.cong_viec_id is distinct from old.cong_viec_id then
      update public.cong_viec
      set trang_thai = public.derive_cong_viec_status(old.cong_viec_id)
      where id = old.cong_viec_id;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_cong_viec_status_after_task_change on public.task;
create trigger sync_cong_viec_status_after_task_change
after insert or update of trang_thai, tien_do_thuc_te, cong_viec_id or delete on public.task
for each row
execute function public.sync_cong_viec_status_after_task_change();

-- Đồng bộ lại dữ liệu cũ để bộ lọc trạng thái và các truy vấn trực tiếp luôn đúng.
update public.cong_viec
set trang_thai = public.derive_cong_viec_status(id);

revoke all on function public.derive_cong_viec_status(uuid) from public;
revoke all on function public.enforce_cong_viec_derived_status() from public;
revoke all on function public.sync_cong_viec_status_after_task_change() from public;
