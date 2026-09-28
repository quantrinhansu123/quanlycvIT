-- Bo log tu dong "doi trang thai" trong timeline Task (giam nhieu).
-- Chi giu: tao Task, duyet hoan thanh, chinh sua noi dung. Cac dong
-- status_changed cu van nam trong DB (xem cau lenh don dep ben duoi neu muon xoa).

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
    -- Chi ghi moc duyet hoan thanh; cac chuyen trang thai trung gian khong ghi nua.
    if new.trang_thai = 'done' then
      insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
      values (new.id, 'approved', actor, 'Task đã được duyệt hoàn thành', jsonb_build_object('tu', old.trang_thai, 'den', new.trang_thai));
    end if;
  elsif new.tien_do_thuc_te is distinct from old.tien_do_thuc_te
    or new.ten_task is distinct from old.ten_task
    or new.mo_ta is distinct from old.mo_ta
    or new.ngay_bat_dau is distinct from old.ngay_bat_dau
    or new.ngay_ket_thuc is distinct from old.ngay_ket_thuc
    or new.uu_tien is distinct from old.uu_tien
    or new.nguoi_phu_trach_id is distinct from old.nguoi_phu_trach_id then
    insert into public.task_hoat_dong (task_id, loai, tac_gia_id, tieu_de, chi_tiet)
    values (new.id, 'edited', actor, 'Task được chỉnh sửa', jsonb_build_object('tien_do', new.tien_do_thuc_te));
  end if;

  return new;
end;
$$;

-- Don dep (tuy chon, chay rieng khi muon xoa lich su doi trang thai cu):
-- delete from public.task_hoat_dong where loai = 'status_changed';
