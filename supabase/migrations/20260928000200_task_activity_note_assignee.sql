-- Ghi chu hoat dong Task: them Nguoi phu trach (tuy chon).
-- Luu trong chi_tiet JSON: nguoi_phu_trach_id + nguoi_phu_trach_ten (snapshot ten
-- tai thoi diem ghi, giong cach tac_gia hien thi ten). Dung default null nen cac
-- client cu goi 3 tham so van tuong thich.

drop function if exists public.append_task_activity_note(uuid, text, text);
drop function if exists public.update_task_activity_note(uuid, uuid, text, text);

create or replace function public.append_task_activity_note(
  p_task_id uuid,
  p_result text,
  p_content text,
  p_nguoi_phu_trach_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_ten text;
  v_note_id uuid;
begin
  v_actor_id := public.current_tai_khoan_id();
  select role into v_role from public.tai_khoan where id = v_actor_id;
  if v_actor_id is null or v_role is null then
    raise exception 'Activity author not found' using errcode = '42501';
  end if;

  if v_role = 'member'
    and not exists (
      select 1 from public.task
      where id = p_task_id and (nguoi_phu_trach_id = v_actor_id or nguoi_test_id = v_actor_id)
    )
    and not exists (
      select 1 from public.task_phu_trach
      where task_id = p_task_id and tai_khoan_id = v_actor_id
    ) then
    raise exception 'Task access denied' using errcode = '42501';
  end if;

  if p_nguoi_phu_trach_id is not null then
    select ten_nv into v_ten from public.tai_khoan where id = p_nguoi_phu_trach_id;
    if v_ten is null then
      raise exception 'Nguoi phu trach khong ton tai' using errcode = '23503';
    end if;
  end if;

  insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
  values (
    p_task_id,
    'note',
    v_actor_id,
    p_result,
    jsonb_build_object(
      'noi_dung', p_content,
      'nguoi_phu_trach_id', p_nguoi_phu_trach_id,
      'nguoi_phu_trach_ten', v_ten
    )
  )
  returning id into v_note_id;
  return v_note_id;
end;
$$;

create or replace function public.update_task_activity_note(
  p_task_id uuid,
  p_note_id uuid,
  p_result text,
  p_content text,
  p_nguoi_phu_trach_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_ten text;
begin
  v_actor_id := public.current_tai_khoan_id();
  select role into v_role from public.tai_khoan where id = v_actor_id;
  if v_actor_id is null or v_role is null then
    raise exception 'Activity author not found' using errcode = '42501';
  end if;

  if v_role = 'member'
    and not exists (
      select 1 from public.task
      where id = p_task_id and (nguoi_phu_trach_id = v_actor_id or nguoi_test_id = v_actor_id)
    )
    and not exists (
      select 1 from public.task_phu_trach
      where task_id = p_task_id and tai_khoan_id = v_actor_id
    ) then
    raise exception 'Task access denied' using errcode = '42501';
  end if;

  if p_nguoi_phu_trach_id is not null then
    select ten_nv into v_ten from public.tai_khoan where id = p_nguoi_phu_trach_id;
    if v_ten is null then
      raise exception 'Nguoi phu trach khong ton tai' using errcode = '23503';
    end if;
  end if;

  update public.task_hoat_dong
  set tieu_de = p_result,
    chi_tiet = jsonb_build_object(
      'noi_dung', p_content,
      'nguoi_phu_trach_id', p_nguoi_phu_trach_id,
      'nguoi_phu_trach_ten', v_ten
    )
  where id = p_note_id
    and task_id = p_task_id
    and loai = 'note'
    and (tac_gia_id = v_actor_id or v_role = 'admin');
  if not found then return null; end if;
  return p_note_id;
end;
$$;

revoke execute on function public.append_task_activity_note(uuid, text, text, uuid) from public, anon;
revoke execute on function public.update_task_activity_note(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.append_task_activity_note(uuid, text, text, uuid) to authenticated;
grant execute on function public.update_task_activity_note(uuid, uuid, text, text, uuid) to authenticated;

comment on column public.task_hoat_dong.chi_tiet is
  'Chi tiet su kien Task; ghi chu thu cong luu noi_dung + nguoi_phu_trach trong JSON.';
