-- GĐ2 (PERF-UNIFIED-IMPLEMENTATION-PLAN.md): tìm kiếm công việc/task hiện dùng
-- ILIKE '%term%' gây Seq Scan (đã xác nhận bằng EXPLAIN trước migration này).
-- Thêm chỉ mục trigram để tăng tốc ILIKE, và chỉ mục (created_at desc, id desc)
-- cho phân trang offset đang dùng .order("created_at", { ascending: false }).

create extension if not exists pg_trgm;

create index if not exists cong_viec_ten_cv_trgm_idx
  on public.cong_viec using gin (ten_cv gin_trgm_ops);

create index if not exists task_ten_task_trgm_idx
  on public.task using gin (ten_task gin_trgm_ops);

create index if not exists cong_viec_created_at_id_idx
  on public.cong_viec (created_at desc, id desc);

create index if not exists task_created_at_id_idx
  on public.task (created_at desc, id desc);
