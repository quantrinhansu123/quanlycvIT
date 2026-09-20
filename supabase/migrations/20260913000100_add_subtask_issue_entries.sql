alter table public.task
  add column if not exists van_de_giai_phap jsonb not null default '[]'::jsonb;

comment on column public.task.van_de_giai_phap is
  'Danh sach van de va giai phap cua Task (moi dong: id, problem, solution).';
