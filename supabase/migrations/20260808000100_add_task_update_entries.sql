alter table public.cong_viec
  add column if not exists cap_nhat_bo_sung jsonb not null default '[]'::jsonb;

comment on column public.cong_viec.cap_nhat_bo_sung is
  'Cac lan bo sung mo ta + dinh kem sau lan dau, dang [{"id":"...","description":"...","images":[...],"files":[...],"links":[...],"createdAt":"..."}].';
