-- Tiến độ thực tế của Task do ứng dụng ghi theo trạng thái Prompt (0–100),
-- không còn bị ép theo trạng thái workflow.

create or replace function public.sync_task_progress_from_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  return new;
end;
$$;

alter table public.task drop constraint if exists task_approval_progress_consistent;

comment on function public.sync_task_progress_from_status() is
  'Không còn ghi đè tiến độ. Tiến độ thực tế được tính từ trạng thái Prompt.';
