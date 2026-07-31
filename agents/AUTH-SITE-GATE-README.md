# AUTH - Bắt buộc đăng nhập toàn site + thương hiệu trang đăng nhập

## Mục đích

Trước đây `src/app/(dashboard)/layout.tsx` không kiểm tra phiên đăng nhập — ai có URL cũng vào được toàn bộ dashboard. Việc này bổ sung chặn truy cập ở lớp Proxy (Next.js 16 đổi tên `middleware.ts` thành `proxy.ts` — xem `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`), bắt buộc đăng nhập mới vào được bất kỳ trang nào ngoài `/dang-nhap`.

**Trạng thái: Đã triển khai.**

## Vị trí mã nguồn

- `src/proxy.ts` — file đã tồn tại sẵn để làm mới cookie phiên Supabase (`getClaims()`); bổ sung thêm:
  - `PUBLIC_PATHS = ["/dang-nhap"]` và `isPublicPath()`.
  - Chưa đăng nhập + không phải route công khai → redirect `/dang-nhap`.
  - Đã đăng nhập + đang ở route công khai → redirect `/`.
  - Dùng lại kết quả `getClaims()` sẵn có để xác định trạng thái đăng nhập, không gọi thêm request `getUser()` — tránh round-trip thừa (nhất quán với các nguyên tắc ở `PERF-DATA-SAVE-OPTIMIZATION-README.md`).
  - `matcher` loại trừ `/api`, `_next/static`, `_next/image`, favicon và file ảnh tĩnh — API vẫn xác thực riêng bằng Bearer token qua `createApiSupabaseClient` (xem `src/lib/supabase/api.ts`), không phụ thuộc cookie.
- `src/app/icon.png` — thêm app icon (favicon PNG) dùng chính logo công ty (`public/logo-viet-nhat-ipt.png`); trước đó `src/app/favicon.ico` vẫn là icon mặc định của Next.js dù tên/logo ở trang đăng nhập và sidebar đã đổi từ trước.

## Hiện trạng thương hiệu trang đăng nhập (đã có sẵn trước khi làm việc này)

`src/components/auth/LoginPage.tsx` đã dùng tên "IT Việt Nhật" và logo `public/logo-viet-nhat-ipt.png` từ các commit trước (`refactor: cập nhật tên và mô tả hệ thống thành IT Việt Nhật`, `refactor: cập nhật tone màu và logo công ty`). `src/app/layout.tsx` cũng đã có metadata `title`/`description`/`openGraph` đúng tên công ty. Việc còn thiếu duy nhất là app icon (favicon) — đã bổ sung ở trên.

## Lưu ý khi thay đổi tiếp

- Proxy chỉ làm kiểm tra "optimistic" (đọc/xác thực JWT cục bộ qua `getClaims`), đúng khuyến nghị chính thức của Next.js — không dùng làm lớp bảo mật duy nhất. Các Route Handler dưới `src/app/api/**` vẫn phải tự kiểm tra quyền khi cần (xem `assertAdminAccount` trong `TASK-APPROVAL-README.md` làm ví dụ).
- RLS của nhiều bảng hiện vẫn ở chế độ "dev anon" (`using (true)` cho cả role `anon`, xem các migration `dev_anon_*`) — việc chặn ở Proxy không thay đổi việc gọi thẳng API bằng HTTP client vẫn có thể thành công nếu không có Bearer token hợp lệ nhưng RLS cho phép anon. Đây là nợ kỹ thuật cần xử lý riêng trước khi lên production, không nằm trong phạm vi việc này.
- Nếu thêm route công khai mới (trang đăng ký, quên mật khẩu...), nhớ thêm vào `PUBLIC_PATHS` trong `src/proxy.ts`.
