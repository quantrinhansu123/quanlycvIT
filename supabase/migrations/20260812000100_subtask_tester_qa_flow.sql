-- Luồng QA cho Task con: người thực hiện -> tester -> admin duyệt.

alter table public.task
  add column if not exists nguoi_test_id uuid references public.tai_khoan(id) on delete set null,
  add column if not exists ghi_chu_test text;

create index if not exists task_nguoi_test_idx on public.task(nguoi_test_id);

alter table public.task drop constraint if exists task_trang_thai_check;
alter table public.task
  add constraint task_trang_thai_check
  check (trang_thai in ('todo', 'in_progress', 'testing', 'review', 'done'));

create or replace function public.sync_task_progress_from_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.trang_thai is distinct from old.trang_thai then
    new.tien_do_thuc_te := case
      when new.trang_thai = 'todo' then 0
      when new.trang_thai = 'in_progress' then
        case
          when new.tien_do_thuc_te > 0 and new.tien_do_thuc_te < 100 then new.tien_do_thuc_te
          else 1
        end
      when new.trang_thai in ('testing', 'review', 'done') then 100
      else new.tien_do_thuc_te
    end;
  end if;
  return new;
end;
$$;

alter table public.task drop constraint if exists task_approval_progress_consistent;
alter table public.task
  add constraint task_approval_progress_consistent check (
    (trang_thai = 'todo' and tien_do_thuc_te = 0)
    or (trang_thai = 'in_progress' and tien_do_thuc_te > 0 and tien_do_thuc_te < 100)
    or (trang_thai in ('testing', 'review', 'done') and tien_do_thuc_te = 100)
  );

comment on column public.task.nguoi_test_id is 'Tài khoản được giao kiểm thử Task trước bước admin duyệt.';
comment on column public.task.ghi_chu_test is 'Ghi chú của lần kiểm thử fail gần nhất.';
comment on function public.sync_task_progress_from_status() is
  'Đồng bộ tiến độ Task: todo=0, in_progress=1..99, testing/review/done=100.';

alter table public.thong_bao drop constraint if exists thong_bao_loai_check;
alter table public.thong_bao
  add constraint thong_bao_loai_check
  check (loai in ('task_assigned', 'task_needs_testing', 'task_test_failed'));

create or replace function public.tao_thong_bao_qa_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trang_thai = 'testing'
     and old.trang_thai is distinct from 'testing'
     and new.nguoi_test_id is not null then
    insert into public.thong_bao(tai_khoan_id, loai, tieu_de, noi_dung, task_id)
    values (
      new.nguoi_test_id,
      'task_needs_testing',
      'Bạn có Task cần test',
      'Task “' || coalesce(new.ten_task, 'Chưa đặt tên') || '” đang chờ bạn kiểm thử.',
      new.id
    );
  elsif old.trang_thai = 'testing'
        and new.trang_thai = 'in_progress'
        and new.nguoi_phu_trach_id is not null then
    insert into public.thong_bao(tai_khoan_id, loai, tieu_de, noi_dung, task_id)
    values (
      new.nguoi_phu_trach_id,
      'task_test_failed',
      'Task chưa đạt kiểm thử',
      'Task “' || coalesce(new.ten_task, 'Chưa đặt tên') || '” cần sửa: ' || coalesce(new.ghi_chu_test, 'Chưa có ghi chú.'),
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists task_notify_qa_status on public.task;
create trigger task_notify_qa_status
after update of trang_thai on public.task
for each row execute function public.tao_thong_bao_qa_task();

revoke execute on function public.tao_thong_bao_qa_task() from public, anon, authenticated;

-- Ghi đúng nhãn trạng thái mới vào timeline hoạt động.
create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  actor := public.current_tai_khoan_id();
  if tg_op = 'INSERT' then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'created', actor, 'Task được tạo', jsonb_build_object('trang_thai', new.trang_thai));
    return new;
  end if;

  if new.trang_thai is distinct from old.trang_thai then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (
      new.id,
      case when new.trang_thai = 'done' then 'approved' else 'status_changed' end,
      actor,
      case new.trang_thai
        when 'in_progress' then 'Task chuyển sang Đang làm'
        when 'testing' then 'Task báo cáo hoàn tất, chờ test'
        when 'review' then 'Task đã Pass test, chờ duyệt'
        when 'done' then 'Task đã được duyệt hoàn thành'
        else 'Task được đưa về Chưa bắt đầu'
      end,
      jsonb_build_object('tu', old.trang_thai, 'den', new.trang_thai)
    );
  elsif new.tien_do_thuc_te is distinct from old.tien_do_thuc_te
    or new.ten_task is distinct from old.ten_task
    or new.mo_ta is distinct from old.mo_ta
    or new.ngay_bat_dau is distinct from old.ngay_bat_dau
    or new.ngay_ket_thuc is distinct from old.ngay_ket_thuc
    or new.uu_tien is distinct from old.uu_tien
    or new.nguoi_phu_trach_id is distinct from old.nguoi_phu_trach_id
    or new.nguoi_test_id is distinct from old.nguoi_test_id then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'edited', actor, 'Task được chỉnh sửa', jsonb_build_object('tien_do', new.tien_do_thuc_te));
  end if;
  return new;
end;
$$;

revoke execute on function public.log_task_activity() from public, anon, authenticated;
