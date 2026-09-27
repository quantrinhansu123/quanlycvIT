-- Cho phep ca qua dem: check-out co the nho hon check-in (sang hom sau).
-- Bang chi luu gio (time) nen khong the dung CHECK gio_checkout >= gio_checkin nua.
alter table if exists public.nhan_vien_cham_cong
  drop constraint if exists nhan_vien_cham_cong_gio_hop_le;

comment on table public.nhan_vien_cham_cong is
  'Ghi nhận ngày và giờ check-in, check-out của nhân viên. Nếu giờ check-out nhỏ hơn giờ check-in thì được hiểu là ca qua đêm (sáng hôm sau).';
