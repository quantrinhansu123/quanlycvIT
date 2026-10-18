create or replace function public.append_task_detail_time_record(
  p_task_id uuid,
  p_type text,
  p_actor_id uuid,
  p_detail_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_records jsonb;
  v_last_type text;
  v_record jsonb;
  v_updates jsonb;
  v_handover text;
  v_deleted boolean := false;
begin
  if p_type not in ('start', 'pause', 'end') then
    raise exception 'Invalid time record type' using errcode = '22023';
  end if;

  select coalesce(time_records, '[]'::jsonb), cap_nhat_bo_sung, ban_giao_noi_dung
    into v_records, v_updates, v_handover
    from public.task
    where id = p_task_id
    for update;

  if not found then
    return null;
  end if;

  if jsonb_typeof(v_records) <> 'array' then
    v_records := '[]'::jsonb;
  end if;

  begin
    v_deleted := coalesce((v_handover::jsonb ->> 'initialDeleted')::boolean, false);
  exception when invalid_text_representation then
    v_deleted := false;
  end;
  if p_detail_id is null or (p_detail_id = 'initial' and v_deleted)
    or (p_detail_id <> 'initial' and not exists (
      select 1 from jsonb_array_elements(coalesce(v_updates, '[]'::jsonb)) item
      where item ->> 'id' = p_detail_id
    )) then
    raise exception 'Invalid task detail' using errcode = '22023';
  end if;

  select item ->> 'type' into v_last_type
    from jsonb_array_elements(v_records) with ordinality as records(item, position)
    where item ->> 'detailId' = p_detail_id
    order by position desc limit 1;
  if (p_type = 'start' and v_last_type not in ('pause', 'end') and v_last_type is not null)
    or (p_type = 'pause' and v_last_type is distinct from 'start')
    or (p_type = 'end' and (v_last_type is null or v_last_type not in ('start', 'pause'))) then
    raise exception 'Invalid time record transition' using errcode = '22023';
  end if;

  v_record := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', p_type,
    'detailId', p_detail_id,
    'at', clock_timestamp(),
    'actorId', p_actor_id
  );
  v_records := v_records || jsonb_build_array(v_record);

  update public.task set time_records = v_records where id = p_task_id;
  return v_records;
end;
$$;

revoke execute on function public.append_task_detail_time_record(uuid, text, uuid, text) from public, anon;
grant execute on function public.append_task_detail_time_record(uuid, text, uuid, text) to authenticated;
