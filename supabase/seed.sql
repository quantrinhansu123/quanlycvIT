-- Du lieu mau phuc vu phat trien Goal App.
-- Tat ca ten, email, so dien thoai va so tai khoan ben duoi deu la du lieu gia lap.
-- File co the chay lai: ma phong ban va ma nhan vien trung se duoc cap nhat.

insert into public.phong_ban (
  ma_pb,
  ten_pb,
  cap_do,
  chuc_vu,
  mo_ta,
  trang_thai_cv
)
values
  ('BGD', 'Ban Giám đốc', 1, array['Giám đốc vận hành'], 'Điều hành và quản trị doanh nghiệp', 'active'),
  ('PMO', 'Phòng Quản lý dự án', 1, array['Trưởng phòng PMO', 'Quản lý dự án'], 'Quản trị danh mục và tiến độ dự án', 'active'),
  ('CNTT', 'Phòng Công nghệ thông tin', 1, array['Trưởng nhóm kỹ thuật', 'Lập trình viên', 'Kiểm thử viên'], 'Phát triển và vận hành hệ thống', 'active'),
  ('KD', 'Phòng Kinh doanh', 1, array['Trưởng phòng Kinh doanh', 'Chuyên viên Kinh doanh'], 'Kinh doanh và chăm sóc khách hàng', 'active'),
  ('NS', 'Phòng Nhân sự', 1, array['Chuyên viên Nhân sự'], 'Tuyển dụng và quản trị nhân sự', 'active')
on conflict (ma_pb) do update
set
  ten_pb = excluded.ten_pb,
  cap_do = excluded.cap_do,
  chuc_vu = excluded.chuc_vu,
  mo_ta = excluded.mo_ta,
  trang_thai_cv = excluded.trang_thai_cv,
  updated_at = now();

insert into public.tai_khoan (
  ma_nv,
  ten_nv,
  sdt,
  dia_chi,
  ngay_sinh,
  ngay_vao_lam,
  so_tai_khoan,
  ten_ngan_hang,
  ghi_chu,
  username,
  email,
  phong_ban_id,
  chuc_vu,
  role,
  status
)
values
  (
    'NV001', 'Nguyễn Minh Anh', '0000000001', 'Quận Cầu Giấy, Hà Nội',
    '1988-03-15', '2020-01-06', 'TEST000001', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - quản trị hệ thống', 'minhanh.nv001', 'minhanh.nv001@example.com',
    (select id from public.phong_ban where ma_pb = 'BGD'),
    'Giám đốc vận hành', 'admin', 'active'
  ),
  (
    'NV002', 'Trần Quốc Bảo', '0000000002', 'Quận Nam Từ Liêm, Hà Nội',
    '1990-07-22', '2020-06-15', 'TEST000002', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - quản lý PMO', 'quocbao.nv002', 'quocbao.nv002@example.com',
    (select id from public.phong_ban where ma_pb = 'PMO'),
    'Trưởng phòng PMO', 'manager', 'active'
  ),
  (
    'NV003', 'Lê Thu Hà', '0000000003', 'Quận Thanh Xuân, Hà Nội',
    '1992-11-08', '2021-02-01', 'TEST000003', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - quản lý dự án', 'thuha.nv003', 'thuha.nv003@example.com',
    (select id from public.phong_ban where ma_pb = 'PMO'),
    'Quản lý dự án', 'manager', 'active'
  ),
  (
    'NV004', 'Phạm Hoàng Nam', '0000000004', 'Thành phố Thủ Đức, TP. Hồ Chí Minh',
    '1991-05-19', '2021-04-12', 'TEST000004', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - trưởng nhóm phát triển', 'hoangnam.nv004', 'hoangnam.nv004@example.com',
    (select id from public.phong_ban where ma_pb = 'CNTT'),
    'Trưởng nhóm kỹ thuật', 'manager', 'active'
  ),
  (
    'NV005', 'Vũ Ngọc Lan', '0000000005', 'Quận Bình Thạnh, TP. Hồ Chí Minh',
    '1995-09-27', '2022-01-10', 'TEST000005', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - phát triển frontend', 'ngoclan.nv005', 'ngoclan.nv005@example.com',
    (select id from public.phong_ban where ma_pb = 'CNTT'),
    'Lập trình viên Frontend', 'member', 'active'
  ),
  (
    'NV006', 'Đỗ Đức Long', '0000000006', 'Quận Hải Châu, Đà Nẵng',
    '1994-01-11', '2022-03-21', 'TEST000006', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - phát triển backend', 'duclong.nv006', 'duclong.nv006@example.com',
    (select id from public.phong_ban where ma_pb = 'CNTT'),
    'Lập trình viên Backend', 'member', 'active'
  ),
  (
    'NV007', 'Bùi Khánh Linh', '0000000007', 'Quận Ngô Quyền, Hải Phòng',
    '1996-06-03', '2022-08-01', 'TEST000007', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - kiểm thử phần mềm', 'khanhlinh.nv007', 'khanhlinh.nv007@example.com',
    (select id from public.phong_ban where ma_pb = 'CNTT'),
    'Kiểm thử viên', 'member', 'active'
  ),
  (
    'NV008', 'Hoàng Gia Huy', '0000000008', 'Quận Ninh Kiều, Cần Thơ',
    '1989-12-14', '2020-09-07', 'TEST000008', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - quản lý kinh doanh', 'giahuy.nv008', 'giahuy.nv008@example.com',
    (select id from public.phong_ban where ma_pb = 'KD'),
    'Trưởng phòng Kinh doanh', 'manager', 'active'
  ),
  (
    'NV009', 'Nguyễn Thảo Vy', '0000000009', 'Quận 7, TP. Hồ Chí Minh',
    '1997-04-25', '2023-02-13', 'TEST000009', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - phát triển khách hàng', 'thaovy.nv009', 'thaovy.nv009@example.com',
    (select id from public.phong_ban where ma_pb = 'KD'),
    'Chuyên viên Kinh doanh', 'member', 'active'
  ),
  (
    'NV010', 'Trịnh Mai Phương', '0000000010', 'Quận Ba Đình, Hà Nội',
    '1993-08-30', '2021-11-01', 'TEST000010', 'Ngân hàng mẫu',
    'Dữ liệu mẫu - tuyển dụng và nhân sự', 'maiphuong.nv010', 'maiphuong.nv010@example.com',
    (select id from public.phong_ban where ma_pb = 'NS'),
    'Chuyên viên Nhân sự', 'member', 'active'
  )
on conflict (ma_nv) do update
set
  ten_nv = excluded.ten_nv,
  sdt = excluded.sdt,
  dia_chi = excluded.dia_chi,
  ngay_sinh = excluded.ngay_sinh,
  ngay_vao_lam = excluded.ngay_vao_lam,
  so_tai_khoan = excluded.so_tai_khoan,
  ten_ngan_hang = excluded.ten_ngan_hang,
  ghi_chu = excluded.ghi_chu,
  username = excluded.username,
  email = excluded.email,
  phong_ban_id = excluded.phong_ban_id,
  chuc_vu = excluded.chuc_vu,
  role = excluded.role,
  status = excluded.status,
  updated_at = now();
