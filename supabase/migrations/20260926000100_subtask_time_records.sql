alter table public.task
  add column if not exists time_records jsonb not null default '[]'::jsonb;

comment on column public.task.time_records is
  'Cac moc thoi gian xu ly Task duoc ghi nhan thu cong (start, pause, end).';

create or replace function public.append_task_time_record(
  p_task_id uuid,
  p_type text,
  p_actor_id uuid
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
begin
  if p_type not in ('start', 'pause', 'end') then
    raise exception 'Invalid time record type' using errcode = '22023';
  end if;

  select coalesce(time_records, '[]'::jsonb)
    into v_records
    from public.task
    where id = p_task_id
    for update;

  if not found then
    return null;
  end if;

  if jsonb_typeof(v_records) <> 'array' then
    v_records := '[]'::jsonb;
  end if;

  v_last_type := v_records -> -1 ->> 'type';
  if (p_type = 'start' and v_last_type not in ('pause', 'end') and v_last_type is not null)
    or (p_type = 'pause' and v_last_type is distinct from 'start')
    or (p_type = 'end' and (v_last_type is null or v_last_type not in ('start', 'pause'))) then
    raise exception 'Invalid time record transition' using errcode = '22023';
  end if;

  v_record := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', p_type,
    'at', clock_timestamp(),
    'actorId', p_actor_id
  );
  v_records := v_records || jsonb_build_array(v_record);

  update public.task set time_records = v_records where id = p_task_id;
  return v_records;
end;
$$;

revoke execute on function public.append_task_time_record(uuid, text, uuid) from public, anon;
grant execute on function public.append_task_time_record(uuid, text, uuid) to authenticated;
