# Supabase TÀI CHÍNH

Project: `qobjixzraumfpsexgazz`

## 1. Khởi tạo schema

Mở SQL Editor của project tài chính:

https://supabase.com/dashboard/project/qobjixzraumfpsexgazz/sql/new

Dán toàn bộ nội dung `20261106000100_init_finance_project.sql` và bấm **Run**.
File này tạo:

- `thu_chi_danh_muc` — danh mục thu/chi
- `thu_chi` — giao dịch
- trigger `updated_at`, trigger kiểm tra loại danh mục
- function `thu_chi_tong_hop` cho dashboard
- RLS bật, chỉ `service_role` (server) được đọc/ghi

## 2. Đồng bộ dữ liệu từ app chính

Sau khi schema đã tạo xong, chạy tại thư mục dự án:

```bash
node scripts/sync-finance-data.cjs --dry-run   # xem trước số dòng
node scripts/sync-finance-data.cjs             # ghi danh mục + giao dịch
```

Hoặc:

```bash
npm run sync:finance
```

Script giữ nguyên UUID, số tiền, ngày, mô tả, tệp hóa đơn và thời gian tạo/cập nhật.
Dùng `--replace` nếu muốn xóa sạch dữ liệu tài chính hiện có trước khi ghi lại.

## 3. Chuyển module tài chính sang project mới

Biến môi trường đã có trong `.env.local`:

```env
FINANCE_SUPABASE_URL=...
FINANCE_SUPABASE_PUBLISHABLE_KEY=...
FINANCE_SUPABASE_ANON_KEY=...
FINANCE_SUPABASE_SERVICE_ROLE_KEY=...
```

Các API `/api/thu-chi*` tự dùng project tài chính khi bảng đã tồn tại; nếu chưa có bảng,
chúng tạm dùng Supabase chính để trang thu chi không bị lỗi. Sau khi chạy migration,
khởi động lại dev server để nhận project tài chính ngay.
