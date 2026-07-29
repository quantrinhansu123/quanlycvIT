# Cơ sở dữ liệu Supabase

Các migration:

- `migrations/20260729000100_initial_schema.sql`
- `migrations/20260729000200_add_project_steps.sql`
- `migrations/20260729000300_dev_anon_project_api.sql`
- `migrations/20260729000400_task_progress_reports.sql`
- `migrations/20260729000500_kanban_thu_tu.sql`
- `migrations/20260729000600_sync_kanban_progress.sql`
- `migrations/20260729000700_multiple_project_managers.sql`
- `migrations/20260729000900_separate_project_managers_members.sql`
- `migrations/20260729001000_subtask_progress_reports.sql`

## Nguồn dữ liệu

Schema được tạo từ 5 sheet trong `E:\PM QLDA\sampleData.xlsx`:

- `taiKhoan` → `public.tai_khoan`
- `phongBan` → `public.phong_ban`
- `duAn` → `public.du_an`
- `congViec` → `public.cong_viec`
- `task` → `public.task`

Cột `duAn.thanhVien` được chuẩn hóa thành bảng
`public.du_an_thanh_vien`.

Danh sách nhiều người quản lý dự án được lưu tại
`public.du_an_quan_ly`; cột `du_an.nguoi_ql_id` tiếp tục lưu người quản lý chính
để tương thích với dữ liệu cũ.

Workbook hiện chỉ có hàng tiêu đề, không có bản ghi dữ liệu. Vì vậy migration
không chứa câu lệnh seed.

File `seed.sql` cung cấp dữ liệu giả lập gồm 5 phòng ban và 10 nhân sự đang hoạt
động để kiểm thử các chức năng Dự án, Công việc và Task. Dữ liệu này không phải
thông tin cá nhân thật và có thể chạy lặp lại theo `ma_pb`/`ma_nv`.

## Chạy migration

Có thể mở Supabase Dashboard → SQL Editor, dán toàn bộ nội dung migration và
chạy một lần.

Nếu dự án đã liên kết Supabase CLI:

```bash
npx supabase db push
```

## Xác thực và RLS

- Cột `password` trong Excel không được tạo. Mật khẩu phải được lưu bởi
  Supabase Auth trong `auth.users`.
- `tai_khoan.auth_user_id` dùng để liên kết hồ sơ nhân viên với người dùng Auth.
- Trong giai đoạn phát triển, migration `20260729000300_dev_anon_project_api.sql`
  tạm cho role `anon` CRUD các bảng `du_an`, `du_an_thanh_vien`, `cong_viec`,
  `task`, đồng thời chỉ đọc các cột danh bạ cần thiết từ `tai_khoan`.
- Trước khi production phải thu hồi các policy `*_anon_dev` và chuyển lại sang
  role `authenticated`.
