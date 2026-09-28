-- Cham cong gan Task chi tiet + list viec chi tiet trong ngay.
-- Dong thoi go CHECK gio cu de cho phep ca qua dem (neu buoc truoc
-- chua chay, migration nay se xu ly luon — chi can chay 1 lan).
alter table if exists public.nhan_vien_cham_cong
  drop constraint if exists nhan_vien_cham_cong_gio_hop_le;

alter table if exists public.nhan_vien_cham_cong
  add column if not exists task_id uuid references public.task(id) on delete set null,
  add column if not exists viec_chi_tiet text;

create index if not exists nhan_vien_cham_cong_task_idx
  on public.nhan_vien_cham_cong (task_id);

comment on column public.nhan_vien_cham_cong.task_id is
  'Task chi tiet nhan vien thuc hien trong ngay (tham chieu public.task).';
comment on column public.nhan_vien_cham_cong.viec_chi_tiet is
  'Danh sach viec chi tiet da lam trong ngay (nhap tu do).';
