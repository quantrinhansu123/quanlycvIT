-- Cham cong co the gan nhieu task trong cung mot ngay.
-- task_id van giu task dau tien de tuong thich du lieu cu (FK + timeline),
-- task_ids luu toan bo danh sach task da chon.

alter table if exists public.nhan_vien_cham_cong
  add column if not exists task_ids uuid[];

-- Chuyen du lieu cu (1 task) sang mang.
update public.nhan_vien_cham_cong
set task_ids = array[task_id]
where task_id is not null
  and (task_ids is null or cardinality(task_ids) = 0);

create index if not exists nhan_vien_cham_cong_task_ids_idx
  on public.nhan_vien_cham_cong using gin (task_ids);

comment on column public.nhan_vien_cham_cong.task_ids is
  'Danh sach task chi tiet nhan vien thuc hien trong ngay (tham chieu public.task).';
