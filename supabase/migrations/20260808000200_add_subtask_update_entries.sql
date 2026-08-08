alter table public.task
  add column if not exists cap_nhat_bo_sung jsonb not null default '[]'::jsonb;

comment on column public.task.cap_nhat_bo_sung is
  'Cac lan bo sung mo ta va dinh kem cua Task tu lan 2 tro di.';

comment on column public.cong_viec.cap_nhat_bo_sung is
  'Cot cu duoc giu lai de tranh mat du lieu; ung dung khong con su dung.';
