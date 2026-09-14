-- Giai đoạn 9 (PERF-UNIFIED-IMPLEMENTATION-PLAN.md): idempotency cho các thao tác
-- tạo quan trọng (dự án/công việc/task). Unique constraint (không phải SELECT rồi
-- INSERT) là lớp chặn race condition thật khi 2 request cùng key đến gần như đồng
-- thời — chỉ 1 trong 2 có thể insert thành công, request thua phát hiện qua lỗi
-- unique_violation (23505) và tự đọc lại kết quả đã lưu.
create table if not exists public.mutation_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tai_khoan(id) on delete cascade,
  idempotency_key uuid not null,
  -- Tên endpoint/loại thao tác (vd. "create-project") — cùng key nhưng khác scope
  -- (hiếm, do lỗi client) vẫn được coi là 2 thao tác khác nhau.
  scope text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (account_id, idempotency_key, scope)
);

create index if not exists mutation_requests_created_at_idx
  on public.mutation_requests (created_at);

alter table public.mutation_requests enable row level security;
create policy mutation_requests_authenticated
  on public.mutation_requests for all to authenticated using (true) with check (true);
