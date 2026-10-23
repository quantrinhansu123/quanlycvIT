-- Restrict DELETE even though the existing permissive policy allows all operations.
create policy nhan_vien_lich_lam_viec_delete_managers
  on public.nhan_vien_lich_lam_viec as restrictive
  for delete to authenticated
  using (
    exists (
      select 1 from public.tai_khoan
      where auth_user_id = (select auth.uid())
        and status = 'active'
        and role in ('admin', 'manager')
    )
  );

grant delete on public.nhan_vien_lich_lam_viec to authenticated;
