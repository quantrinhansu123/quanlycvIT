-- Ho tro bang Kanban: luu thu tu the trong tung cot trang thai.
-- Man hinh: Quan ly cong viec > Bang Kanban.

alter table public.cong_viec
  add column if not exists thu_tu integer not null default 0;

-- Backfill: danh so lai theo tung cot trang thai, giu nguyen thu tu tao.
with da_danh_so as (
  select
    id,
    row_number() over (
      partition by trang_thai
      order by created_at, id
    ) - 1 as vi_tri
  from public.cong_viec
)
update public.cong_viec as cv
set thu_tu = da_danh_so.vi_tri
from da_danh_so
where cv.id = da_danh_so.id;

create index if not exists cong_viec_kanban_idx
  on public.cong_viec(trang_thai, thu_tu);

comment on column public.cong_viec.thu_tu is
  'Thu tu the trong cot Kanban, tinh tu 0 trong pham vi moi trang_thai.';

-- Di chuyen mot the sang cot/vi tri moi va danh so lai ca hai cot.
-- Chay trong mot cau lenh nen dam bao tinh nguyen tu.
create or replace function public.di_chuyen_cong_viec(
  p_id uuid,
  p_trang_thai text,
  p_vi_tri integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trang_thai_cu text;
begin
  if p_trang_thai not in ('todo', 'in_progress', 'review', 'done') then
    raise exception 'Trang thai khong hop le: %', p_trang_thai;
  end if;
  if p_vi_tri < 0 then
    raise exception 'Vi tri phai lon hon hoac bang 0';
  end if;

  select trang_thai into v_trang_thai_cu
  from public.cong_viec
  where id = p_id
  for update;

  if v_trang_thai_cu is null then
    raise exception 'Khong tim thay cong viec %', p_id;
  end if;

  -- Nhan doi thu tu cac the con lai o cot dich de chua vi tri chen.
  update public.cong_viec as cv
  set thu_tu = danh_so.vi_tri * 2
  from (
    select
      id,
      row_number() over (order by thu_tu, created_at, id) as vi_tri
    from public.cong_viec
    where trang_thai = p_trang_thai
      and id <> p_id
  ) as danh_so
  where cv.id = danh_so.id;

  -- The duoc keo nhan so le nen roi dung khe mong muon.
  update public.cong_viec
  set
    trang_thai = p_trang_thai,
    thu_tu = p_vi_tri * 2 + 1,
    tien_do_thuc_te = case
      when p_trang_thai = 'done' then 100
      else tien_do_thuc_te
    end
  where id = p_id;

  -- Danh so lai lien tuc tu 0 cho cot dich.
  update public.cong_viec as cv
  set thu_tu = danh_so.vi_tri
  from (
    select
      id,
      row_number() over (order by thu_tu, created_at, id) - 1 as vi_tri
    from public.cong_viec
    where trang_thai = p_trang_thai
  ) as danh_so
  where cv.id = danh_so.id
    and cv.thu_tu <> danh_so.vi_tri;

  -- Don khoang trong o cot nguon khi the doi cot.
  if v_trang_thai_cu <> p_trang_thai then
    update public.cong_viec as cv
    set thu_tu = danh_so.vi_tri
    from (
      select
        id,
        row_number() over (order by thu_tu, created_at, id) - 1 as vi_tri
      from public.cong_viec
      where trang_thai = v_trang_thai_cu
    ) as danh_so
    where cv.id = danh_so.id
      and cv.thu_tu <> danh_so.vi_tri;
  end if;
end;
$$;

grant execute on function public.di_chuyen_cong_viec(uuid, text, integer)
  to anon, authenticated;

comment on function public.di_chuyen_cong_viec(uuid, text, integer) is
  'Keo tha Kanban: doi trang thai + vi tri cua cong viec, danh so lai cot nguon va cot dich.';
