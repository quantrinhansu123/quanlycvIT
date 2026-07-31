-- Tiến độ Task chỉ đạt trạng thái chờ duyệt ở 100%; hoàn thành phải qua bước duyệt.
-- Đồng thời sửa các bản ghi cũ có trạng thái không khớp với tiến độ.

update public.task
set tien_do_thuc_te = 100
where trang_thai = 'done'
  and tien_do_thuc_te <> 100;

update public.task
set trang_thai = case
  when tien_do_thuc_te > 0 then 'in_progress'
  else 'todo'
end
where trang_thai = 'review'
  and tien_do_thuc_te < 100;

alter table public.task
drop constraint if exists task_approval_progress_consistent;

alter table public.task
add constraint task_approval_progress_consistent check (
  (tien_do_thuc_te = 100 and trang_thai in ('review', 'done'))
  or
  (tien_do_thuc_te < 100 and trang_thai not in ('review', 'done'))
);
