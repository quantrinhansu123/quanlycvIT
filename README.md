# Goal App – Quản lý công việc (Next.js)

Giao diện được dựng lại từ ảnh chụp màn hình "Goal App": Sidebar quản trị + Danh sách dự án (bảng/lưới) + Modal thêm/sửa dự án + Trang chi tiết dự án.

## Công nghệ

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · React 19 · Lucide React.

## Cài đặt & chạy

```bash
npm install
npm run dev
npm run lint
npm run build
```

Mặc định chạy ở `http://localhost:3002` (đổi cổng bằng `next dev -p <port>` nếu cần).

## Kết nối Supabase và API

1. Sao chép `.env.example` thành `.env.local`, sau đó điền
   `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Chạy `npx supabase db push` để áp dụng toàn bộ migration.
3. API nằm tại `/api`. Trong giai đoạn hiện tại, ba màn hình Dự án, Công việc
   và Task gọi API trực tiếp, chưa yêu cầu đăng nhập hay session.
4. Migration `20260729000300_dev_anon_project_api.sql` cấp quyền `anon` tạm
   thời cho các bảng của ba màn hình và chỉ các cột danh bạ cần hiển thị.
5. Ba service dự án, công việc và task đã dùng API thật thay cho mock data.

Các endpoint CRUD:

- `/api/projects` và `/api/projects/:id`
- `/api/tasks` và `/api/tasks/:id` — dữ liệu bảng `cong_viec`
- `/api/subtasks` và `/api/subtasks/:id` — dữ liệu bảng `task`
- `/api/users` — danh sách tài khoản đang hoạt động

Mỗi endpoint danh sách hỗ trợ `GET`, endpoint gốc hỗ trợ `POST`, còn endpoint
theo ID hỗ trợ `GET`, `PUT`, `DELETE`.

## Ghi chú giả định khi dựng theo ảnh

- Ảnh mẫu là giao diện **dashboard quản trị nội bộ** (sidebar + bảng dữ liệu), không phải trang thương mại điện tử, nên các phần Header/Banner/Giỏ hàng public không được dựng.
- Không có ảnh mẫu cho các mục còn lại của sidebar (Ứng dụng, Nhân viên, Kanban, Gantt...) nên các trang này để dạng khung "đang phát triển" (`ComingSoon`), giữ điều hướng hoạt động đầy đủ.
- Ảnh chân dung nhân sự trong ảnh mẫu không nhìn rõ nên dùng avatar chữ cái đầu (initials) thay thế, đủ để tái sử dụng khi có ảnh thật.
- Nút xem dạng lưới/bảng và xuất CSV được suy ra hợp lý từ icon có sẵn trong ảnh — đã cài đặt thành tính năng thật, không phải icon chết.

## Tự kiểm tra

- `npm run lint`: pass, không cảnh báo/lỗi.
- `npm run build`: build production thành công, không lỗi TypeScript.
- Các Route Handler API được kiểm tra trực tiếp ở chế độ chưa có session.
- Không dùng cấu hình quyền `anon` hiện tại cho production; cần bật lại xác thực
  và thu hồi các policy `*_anon_dev` trước khi triển khai chính thức.
