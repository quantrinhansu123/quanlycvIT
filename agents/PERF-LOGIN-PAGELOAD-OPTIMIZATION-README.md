# PERF - Tối ưu tốc độ đăng nhập, tải trang và lưu dữ liệu (vòng 2)

## Mục đích

`PERF-DATA-SAVE-OPTIMIZATION-README.md` đã tối ưu round-trip khi **lưu** dữ liệu (thêm/sửa dự án, công việc, task con). Việc này khảo sát tiếp phần người dùng vẫn thấy chậm: bấm nút **đăng nhập**, **tải trang** (đặc biệt trang chủ sau khi đăng nhập) và cảm giác chờ khi điều hướng giữa các trang.

**Trạng thái: Đã triển khai — đã hoàn thành cả 3 giai đoạn chính (bỏ giai đoạn 4 vi tối ưu, để dành khi cần).**

## Vị trí mã nguồn liên quan

- `src/lib/supabase/authorization.ts` — `requireRequestAccount`, hàm xác thực chạy trên **mọi** route API.
- `src/hooks/useCurrentAccount.ts` — hook tra tài khoản `tai_khoan` theo phiên đăng nhập, dùng ở 10 nơi.
- `src/components/layout/Header.tsx`, `src/components/layout/Sidebar.tsx` — luôn mount cùng lúc, mỗi cái tự gọi `useCurrentAccount`.
- `src/components/dashboard/PerformanceDashboard.tsx` — trang chủ, client component, tải toàn bộ dự án/công việc/thành viên không phân trang.
- `src/components/auth/LoginPage.tsx`, `src/app/api/auth/login/route.ts` — luồng đăng nhập.
- `src/proxy.ts` — đã dùng `getClaims()` (xác thực JWT cục bộ) làm mẫu tham chiếu.
- `src/app/(dashboard)/**/page.tsx` — các trang danh sách, hiện chưa có `loading.tsx` riêng.

## Hiện trạng (nguyên nhân gây chậm)

1. **`requireRequestAccount` dùng `supabase.auth.getUser()`** (`authorization.ts:18-40`) — hàm này gọi mạng tới Supabase Auth server để xác thực token, thay vì xác thực JWT cục bộ bằng `getClaims()` như `proxy.ts` đã làm (xem comment tại `proxy.ts:32-34`: "không cần gọi mạng thêm lần nữa"). `requireRequestAccount` được gọi ở **mọi** route API (GET danh sách lẫn POST/PUT lưu) → mỗi lần tải trang hay lưu dữ liệu đều cõng thêm 1 network round-trip không cần thiết. Đây là điểm tác động lớn nhất vì nhân với số lượng request.
2. **`useCurrentAccount` bị gọi độc lập ở 10 nơi** (Header, Sidebar, trang danh sách dự án/công việc/task, `EmployeeDetailPage`, `ApplicationHubPage`, các panel/modal task con...). Mỗi nơi tự `useEffect` riêng, tự gọi `supabase.auth.getUser()` (mạng) + tự query `tai_khoan` riêng — không chia sẻ kết quả. Header và Sidebar luôn mount cùng lúc nên tối thiểu nhân đôi ngay từ lần tải đầu; vào các trang danh sách/task lại cộng thêm round-trip nữa.
3. **Trang chủ (`PerformanceDashboard.tsx`) là client component, tải toàn bộ dữ liệu không phân trang** — `fetchDashboardData()` gọi song song `projectService.getProjects()`, `taskService.getTasks()`, `projectService.getDirectory()` (không giới hạn số dòng), và chỉ bắt đầu fetch **sau khi** bundle JS tải xong + hydrate xong (không SSR, không prefetch song song với HTML). Chuỗi: HTML → JS → hydrate → 3 fetch API → mỗi fetch tự trả giá điểm 1 ở trên.
4. **Luồng đăng nhập tuần tự, không có gì sai riêng lẻ nhưng cộng dồn**: `LoginPage.tsx:89-126` gọi API `/api/auth/login` → `supabase.auth.setSession()` (thêm round-trip lưu session cục bộ) → `router.replace("/")` + `router.refresh()` → proxy chạy lại `getClaims()` → dashboard mount → lặp lại điểm 2 và 3. Vì vậy "bấm đăng nhập" cảm giác chậm thực ra là chi phí của cả trang chủ dồn vào ngay sau khi đăng nhập, không phải bản thân API login chậm.
5. **Chỉ có 1 `loading.tsx` ở gốc `src/app/`, không có ở nhóm route `(dashboard)`** — đây là Suspense boundary gần nhất bao trùm toàn bộ cây, kể cả `(dashboard)/layout.tsx` (Header/Sidebar). Khi 1 trang con là Server Component có `await` (ví dụ trang chi tiết dự án/công việc/task) đang tải, boundary gốc thay **toàn bộ** layout bằng màn spinner trắng rồi bật lại khi xong — cảm giác giật/trắng trang khi điều hướng, kể cả khi bản thân dữ liệu tải nhanh.
6. *(Phụ, độ ưu tiên thấp, chưa xử lý trong vòng này)* Tra tài khoản khi đăng nhập dùng `.ilike("email"/"username", identifier)` (`route.ts:27-29`) — index hiện có (`tai_khoan_email_lower_uidx`, `username` unique) khớp với so sánh `=`/`lower()`, không chắc được Postgres tận dụng cho `ilike`. Chưa phải vấn đề vì số tài khoản nội bộ nhỏ; ghi nhận để xử lý nếu bảng lớn dần.

## Kế hoạch triển khai (3 giai đoạn, làm tuần tự)

- **Giai đoạn 1 — Đã hoàn thành:** `requireRequestAccount` đổi từ `supabase.auth.getUser()` sang `supabase.auth.getClaims()` (xác thực JWT cục bộ, cùng cách `proxy.ts` đang dùng), lấy `sub` trong claims làm `auth_user_id` để tra `tai_khoan`. Bỏ 1 network round-trip tới Supabase Auth server trên **mọi** route API — tác động cả tốc độ tải trang lẫn tốc độ lưu.
- **Giai đoạn 2 — Đã hoàn thành:** thêm `CurrentAccountProvider` (Context) đặt trong `DashboardLayout`, fetch tài khoản hiện tại đúng 1 lần cho toàn bộ cây trang; `useCurrentAccount` giữ nguyên tên/API (đọc từ context) để không phải sửa 10 nơi gọi. Loại bỏ (N-1) lần gọi `getUser()`/`getClaims()` + query `tai_khoan` trùng lặp mỗi khi vào trang mới.
- **Giai đoạn 3 — Đã hoàn thành:** thêm `src/app/(dashboard)/loading.tsx` (1 file, áp dụng cho toàn bộ route con trong `(dashboard)`) — tạo Suspense boundary riêng ở mức nhóm route, giữ Header/Sidebar đứng yên và chỉ hiển thị skeleton ở vùng nội dung khi trang con đang tải, thay vì để boundary gốc xoá trắng toàn bộ layout.
- **Giai đoạn 4 (tuỳ chọn, chưa làm):** expression index hỗ trợ tra `username` không phân biệt hoa/thường nếu bảng tài khoản lớn dần; giãn tần suất poll thông báo (30s) sang theo `visibilitychange` thay vì cố định; `pnpm lint` báo 3 warning `@next/next/no-img-element` (logo ở `LoginPage.tsx`, `Sidebar.tsx`) — có thể ảnh hưởng LCP nhẹ, đổi sang `next/image` nếu muốn tối ưu thêm (cần cấu hình `sharp`/`remotePatterns`, chưa làm vì rủi ro/lợi ích chưa rõ ràng bằng 3 giai đoạn trên).

## Cách sử dụng tài liệu này

- Trước khi sửa xác thực API hoặc `useCurrentAccount`, đọc mục "Hiện trạng" ở trên để biết vì sao các round-trip tồn tại.
- Khi hoàn thành 1 giai đoạn, cập nhật trạng thái tương ứng ở trên (đổi thành "Đã hoàn thành", ghi thêm PR/commit) thay vì tạo README mới.

## Lưu ý khi thay đổi tiếp

- `getClaims()` xác thực JWT cục bộ bằng JWKS đã cache — nếu đổi khoá ký JWT ở Supabase Dashboard, cần theo tài liệu Supabase để đảm bảo JWKS được làm mới đúng cách; đây là cách chính thức Supabase khuyến nghị thay cho `getUser()` để tránh round-trip, proxy.ts đã áp dụng trước.
- `CurrentAccountProvider` phải tự cập nhật khi `onAuthStateChange` bắn (đăng nhập/đăng xuất/refresh token) — giữ đúng hành vi hiện có của `useCurrentAccount` (rollback về `null` khi đăng xuất).
- Đây là dự án dùng Next.js phiên bản có breaking changes so với kiến thức thông thường (`AGENTS.md`) — trước khi thêm `loading.tsx` hoặc đổi cách proxy/route xử lý, đọc tài liệu trong `node_modules/next/dist/docs/` (đặc biệt `proxy.md` đã được dùng làm tham chiếu ở `AUTH-SITE-GATE-README.md`).
- Xem thêm [[PERF-DATA-SAVE-OPTIMIZATION-README]] cho phần tối ưu lưu dữ liệu đã làm trước đó — giai đoạn 1 ở đây bổ sung thêm cho các route lưu vì `requireRequestAccount`/`assertManagerOrAdmin` cũng nằm trên đường lưu.
