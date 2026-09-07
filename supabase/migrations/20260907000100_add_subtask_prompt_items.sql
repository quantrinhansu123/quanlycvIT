alter table public.task
  add column if not exists prompt_items jsonb not null default '[]'::jsonb;

comment on column public.task.prompt_items is
  'Danh sach yeu cau va URL anh dung de ghep Prompt trong trang chi tiet Task.';
