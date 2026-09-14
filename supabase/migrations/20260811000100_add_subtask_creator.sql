alter table public.task
  add column if not exists nguoi_tao_id uuid references public.tai_khoan(id) on delete set null;

-- Dữ liệu cũ không lưu người tạo; dùng người phụ trách chính làm giá trị gần đúng
-- để cột mới không bị trống. Task tạo mới sẽ lưu đúng tài khoản đang thao tác.
update public.task
set nguoi_tao_id = nguoi_phu_trach_id
where nguoi_tao_id is null
  and nguoi_phu_trach_id is not null;

create index if not exists task_nguoi_tao_idx
  on public.task(nguoi_tao_id);

comment on column public.task.nguoi_tao_id is 'Tài khoản đã tạo Task.';
