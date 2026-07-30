alter table public.task
  add column if not exists tep_dinh_kem jsonb not null default '[]'::jsonb,
  add column if not exists lien_ket_dinh_kem jsonb not null default '[]'::jsonb;

comment on column public.task.tep_dinh_kem is
  'Danh sach tep dinh kem cua Task, dang [{"name":"...","url":"..."}], url tro toi Google Drive.';
comment on column public.task.lien_ket_dinh_kem is
  'Danh sach lien ket dinh kem cua Task, dang [{"label":"...","url":"..."}].';
