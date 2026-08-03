-- Giữ trạng thái Task và tiến độ thực tế nhất quán ở tầng database.
-- API cũng áp dụng quy tắc này, nhưng trigger bảo vệ mọi luồng ghi trực tiếp/RPC.

create or replace function public.sync_task_progress_from_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.trang_thai is distinct from old.trang_thai then
    new.tien_do_thuc_te := case
      when new.trang_thai = 'todo' then 0
      when new.trang_thai = 'in_progress' then
        case
          when new.tien_do_thuc_te > 0 and new.tien_do_thuc_te < 100
            then new.tien_do_thuc_te
          else 1
        end
      when new.trang_thai in ('review', 'done') then 100
      else new.tien_do_thuc_te
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_task_progress_from_status on public.task;
create trigger sync_task_progress_from_status
before insert or update of trang_thai on public.task
for each row execute function public.sync_task_progress_from_status();

-- Sửa các bản ghi đã lệch trước khi bật lại constraint.
update public.task
set tien_do_thuc_te = case
  when trang_thai = 'todo' then 0
  when trang_thai = 'in_progress' then
    case
      when tien_do_thuc_te > 0 and tien_do_thuc_te < 100 then tien_do_thuc_te
      else 1
    end
  when trang_thai in ('review', 'done') then 100
  else tien_do_thuc_te
end
where
  (trang_thai = 'todo' and tien_do_thuc_te <> 0)
  or (trang_thai = 'in_progress' and (tien_do_thuc_te <= 0 or tien_do_thuc_te >= 100))
  or (trang_thai in ('review', 'done') and tien_do_thuc_te <> 100);

alter table public.task
drop constraint if exists task_approval_progress_consistent;

alter table public.task
add constraint task_approval_progress_consistent check (
  (trang_thai = 'todo' and tien_do_thuc_te = 0)
  or (trang_thai = 'in_progress' and tien_do_thuc_te > 0 and tien_do_thuc_te < 100)
  or (trang_thai in ('review', 'done') and tien_do_thuc_te = 100)
);

comment on function public.sync_task_progress_from_status() is
  'Đồng bộ tiến độ Task theo trạng thái: todo=0, in_progress=1..99, review/done=100.';

