-- Lưu riêng từng lần tester trả kết quả để không mất lịch sử khi Task được test lại.

create table if not exists public.task_lich_su_test (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task(id) on delete cascade,
  nguoi_test_id uuid references public.tai_khoan(id) on delete set null,
  ket_qua text not null check (ket_qua in ('passed', 'failed')),
  ghi_chu text,
  created_at timestamptz not null default now()
);

create index if not exists task_lich_su_test_task_created_idx
  on public.task_lich_su_test (task_id, created_at desc);

alter table public.task_lich_su_test enable row level security;

drop policy if exists task_lich_su_test_authenticated on public.task_lich_su_test;
create policy task_lich_su_test_authenticated
  on public.task_lich_su_test for all to authenticated using (true) with check (true);

comment on table public.task_lich_su_test is
  'Lịch sử từng lần kiểm thử Task: Pass/Fail, tester và ghi chú lỗi.';

create or replace function public.luu_lich_su_test_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.trang_thai = 'testing'
     and new.trang_thai in ('review', 'in_progress') then
    insert into public.task_lich_su_test (task_id, nguoi_test_id, ket_qua, ghi_chu)
    values (
      new.id,
      public.current_tai_khoan_id(),
      case when new.trang_thai = 'review' then 'passed' else 'failed' end,
      case when new.trang_thai = 'in_progress' then new.ghi_chu_test else null end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists task_save_test_history on public.task;
create trigger task_save_test_history
after update of trang_thai on public.task
for each row execute function public.luu_lich_su_test_task();

revoke execute on function public.luu_lich_su_test_task() from public, anon, authenticated;
