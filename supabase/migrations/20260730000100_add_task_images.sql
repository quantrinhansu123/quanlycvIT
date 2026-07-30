alter table public.task
  add column if not exists hinh_anh text[] not null default '{}';

comment on column public.task.hinh_anh is
  'Danh sach URL anh minh hoa cua Task, toi da 10 anh theo validation API.';
