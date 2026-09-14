-- Khi xóa công việc, CASCADE xóa task con và mỗi task kích hoạt sync trạng thái
-- parent đã bị xóa → cập nhật vô ích, làm DELETE chậm. Bỏ qua nếu parent không còn.

create or replace function public.sync_cong_viec_status_after_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.cong_viec where id = old.cong_viec_id) then
      update public.cong_viec
      set trang_thai = public.derive_cong_viec_status(old.cong_viec_id)
      where id = old.cong_viec_id;
    end if;
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
