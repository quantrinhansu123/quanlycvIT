-- Cho phep xoa su kien trong timeline Task (ghi chu thu cong + su kien tu dong).
-- Chi tac gia hoac admin duoc xoa.

create or replace function public.delete_task_activity_note(
  p_task_id uuid,
  p_note_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
begin
  v_actor_id := public.current_tai_khoan_id();
  select role into v_role from public.tai_khoan where id = v_actor_id;
  if v_actor_id is null or v_role is null then
    raise exception 'Activity author not found' using errcode = '42501';
  end if;

  delete from public.task_hoat_dong
  where id = p_note_id
    and task_id = p_task_id
    and (tac_gia_id = v_actor_id or v_role = 'admin');
  if not found then return false; end if;
  return true;
end;
$$;

revoke execute on function public.delete_task_activity_note(uuid, uuid) from public, anon;
grant execute on function public.delete_task_activity_note(uuid, uuid) to authenticated;
