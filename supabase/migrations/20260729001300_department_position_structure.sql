-- Luu cau truc cap bac va quan he quan ly giua cac chuc vu trong phong ban.
alter table public.phong_ban
  add column if not exists cau_truc_chuc_vu jsonb not null default '[]'::jsonb;

update public.phong_ban as pb
set cau_truc_chuc_vu = structures.value
from (
  select
    department.id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'name', position.name,
          'level', position.ordinality,
          'managerId', null
        )
        order by position.ordinality
      ) filter (where position.name is not null),
      '[]'::jsonb
    ) as value
  from public.phong_ban as department
  left join lateral unnest(department.chuc_vu)
    with ordinality as position(name, ordinality) on true
  group by department.id
) as structures
where pb.id = structures.id
  and pb.cau_truc_chuc_vu = '[]'::jsonb;

alter table public.phong_ban
  drop constraint if exists phong_ban_cau_truc_chuc_vu_array;
alter table public.phong_ban
  add constraint phong_ban_cau_truc_chuc_vu_array
  check (jsonb_typeof(cau_truc_chuc_vu) = 'array');

comment on column public.phong_ban.cau_truc_chuc_vu is
  'Danh sach JSON chuc vu: id, name, level va managerId.';
