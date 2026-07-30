-- PostgreSQL does not have MySQL's LONGTEXT type.
-- `text` is the native variable-length type for long descriptions.
alter table public.du_an
  alter column mo_ta type text using mo_ta::text;

alter table public.cong_viec
  alter column mo_ta type text using mo_ta::text;

alter table public.task
  alter column mo_ta type text using mo_ta::text;

comment on column public.du_an.mo_ta is
  'Mo ta du an dang van ban dai (PostgreSQL text).';

comment on column public.cong_viec.mo_ta is
  'Mo ta cong viec dang van ban dai (PostgreSQL text).';

comment on column public.task.mo_ta is
  'Mo ta task dang van ban dai (PostgreSQL text).';
