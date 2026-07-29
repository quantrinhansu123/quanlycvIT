-- Dong bo tien do thuc te theo cot dich khi keo tha Kanban.
-- Sap xep lai trong cung mot cot khong lam thay doi tien do.

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

  -- Khi doi cot, tien do phai dong bo theo cot dich.
  update public.cong_viec
  set
    trang_thai = p_trang_thai,
    thu_tu = p_vi_tri * 2 + 1,
    tien_do_thuc_te = case
      when v_trang_thai_cu = p_trang_thai then tien_do_thuc_te
      when p_trang_thai = 'todo' then 0
      when p_trang_thai = 'in_progress' then 30
      when p_trang_thai = 'review' then 70
      when p_trang_thai = 'done' then 100
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

comment on function public.di_chuyen_cong_viec(uuid, text, integer) is
  'Keo tha Kanban: doi trang thai, vi tri va dong bo tien do theo cot dich.';
