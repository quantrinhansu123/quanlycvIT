-- Timeline Task: them loai 'cham_cong' de tu dong ghi nhat ky
-- khi cham cong gan task (check-in / check-out moi).

alter table public.task_hoat_dong
  drop constraint if exists task_hoat_dong_loai_check;

alter table public.task_hoat_dong
  add constraint task_hoat_dong_loai_check
  check (loai in (
    'created', 'accepted', 'status_changed', 'progress_reported', 'approved', 'edited', 'note', 'cham_cong'
  ));

comment on table public.task_hoat_dong is
  'Nhat ky hoat dong cua Task: tao, xac nhan, doi trang thai, bao cao, duyet, sua, ghi chu, cham cong.';
