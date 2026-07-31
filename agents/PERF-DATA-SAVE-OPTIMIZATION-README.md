# PERF - Tối ưu tốc độ lưu dữ liệu (thêm/sửa dự án, công việc, task con)

## Mục đích

Ghi lại hiện trạng khảo sát và kế hoạch tối ưu hiệu năng cho các luồng thêm mới/chỉnh sửa dữ liệu (dự án, công việc, task con, nhân sự) — mục tiêu giảm thời gian phản hồi khi bấm Lưu và giảm cảm giác chờ trên giao diện.

**Trạng thái: Đã triển khai — đã hoàn thành cả 4 giai đoạn.** File này sẽ được cập nhật thành "Đã triển khai" theo từng giai đoạn khi có PR tương ứng.

## Vị trí mã nguồn liên quan

- `src/lib/supabase/data.ts` — logic tạo/sửa dự án, công việc, task con (nguồn gây chậm chính).
- `src/lib/supabase/accounts.ts`, `src/lib/supabase/departments.ts` — luồng nhân sự/phòng ban, đã làm đúng mẫu (insert/update kèm `.select().single()` trong cùng 1 round-trip), dùng làm tham chiếu khi sửa `data.ts`.
- `src/lib/supabase/api.ts` — khởi tạo Supabase client cho API route.
- `src/components/projects/ProjectFormModal.tsx`, `src/components/tasks/TaskFormModal.tsx` — form submit ở client.
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/page.tsx`, `.../danh-sach-cong-viec/page.tsx` — nơi gọi refetch sau khi lưu.
- `src/app/api/media/task-file/route.ts` — upload file đính kèm.

## Hiện trạng (nguyên nhân gây chậm)

1. **Round-trip tuần tự dài khi tạo/sửa dự án** — `data.ts:561-651`. Chuỗi `resolveAccountIds` (managers rồi members), insert, `syncProjectManagers` rồi `syncProjectMembers` (mỗi hàm tự nó là 3-5 round-trip: SELECT → INSERT → DELETE → UPDATE), rồi SELECT lại toàn bộ qua `getProject()` chỉ để trả response. Ước tính ~10-12 round-trip tuần tự/lần lưu.
2. **Pattern tương tự ở công việc/task con** — `data.ts:964-1034` (`createWorkTask`/`updateWorkTask`), `data.ts:1288-1344` (`createSubtask`/`updateSubtask`), `data.ts:844-895` (`syncAssignments`), `data.ts:925-944, 1040-1072` (các hàm assert). ~7-9 round-trip tuần tự/lần lưu.
3. **Không có optimistic update ở client** — `ProjectFormModal.tsx:451-497` chờ round-trip đầy đủ rồi mới `onSaved()`; `danh-sach-du-an/page.tsx:281-284` gọi thêm 1 GET refetch toàn trang; `danh-sach-cong-viec/page.tsx:390-394` gọi thêm 2 GET (`loadTasks` + `refreshDependencyTasks`).
4. **Resolve account ID theo từng phần tử** — `data.ts:296-324`, dùng `Promise.all` nhưng vẫn là N query riêng lẻ thay vì 1 câu `IN (...)`.
5. **Upload file qua Google Apps Script không có timeout** — `api/media/task-file/route.ts:36-48`, có thể chặn toàn bộ luồng lưu nếu Apps Script phản hồi chậm.
6. **Tạo `SupabaseClient` mới mỗi request** — `api.ts:6-29` (tác động nhỏ, ghi nhận thêm).

## Kế hoạch triển khai (4 giai đoạn)

- **Giai đoạn 1 — Đã hoàn thành:** đã gộp `Promise.all` cho các cặp query không phụ thuộc nhau (`resolveAccountIds` managers/members, `syncProjectManagers`/`syncProjectMembers`); `resolveAccountIds` nay tra tất cả tham chiếu trong một truy vấn (dùng `IN (...)` theo `id` hoặc `ma_nv`, hoặc một điều kiện `OR` khi input có cả hai loại).
- **Giai đoạn 2 — Đã hoàn thành:** mutation tạo/sửa dự án, công việc và task con nay dùng `.select(...).single()` hoặc `.maybeSingle()` ngay trong câu ghi và trả payload từ kết quả đó; `syncProjectManagers`/`syncProjectMembers`/`syncAssignments` nay `upsert` theo batch và chỉ xóa các bản ghi không còn được chọn, không cần SELECT diff trước khi ghi.
- **Giai đoạn 3 — Đã hoàn thành:** form dự án/công việc dùng `useTransition` khi lưu; trang danh sách dùng `useOptimistic`, cập nhật state trực tiếp từ response POST/PUT và tự rollback optimistic state khi request lỗi. Đã bỏ refetch danh sách và tải lại danh sách công việc tiền đề sau khi lưu.
- **Giai đoạn 4 — Đã hoàn thành:** upload file qua Google Apps Script có timeout 30 giây; không cache `SupabaseClient` vì mỗi API route hiện chỉ tạo một client/request; API client chuyển access token vào route handler và migration `20260731000100_production_rls_cleanup.sql` thu hồi policy/grant `anon` tạm thời, giữ truy cập qua role `authenticated` trước khi production.

## Cách sử dụng tài liệu này

- Trước khi sửa `data.ts` phần dự án/công việc/task, đọc mục "Hiện trạng" ở trên để biết vị trí và lý do các round-trip tồn tại.
- Khi hoàn thành 1 giai đoạn, cập nhật trạng thái tương ứng trong mục "Kế hoạch triển khai" (đổi gạch đầu dòng thành đã xong, ghi thêm PR/commit liên quan) thay vì tạo README mới, trừ khi vượt 300 dòng.

## Lưu ý khi thay đổi tiếp

- Khi đổi `syncProjectManagers`/`syncProjectMembers`/`syncAssignments` sang `upsert` batch, phải giữ đúng ràng buộc nghiệp vụ hiện tại (ví dụ cờ "la_chinh" cho quản lý chính) — kiểm tra kỹ dữ liệu test trước/sau.
- Khi bỏ SELECT lại sau insert/update, đảm bảo response trả về cho client vẫn đủ trường mà `ProjectFormModal`/`TaskFormModal` và trang danh sách đang cần, tránh vỡ UI do thiếu field.
- Khi thêm optimistic update, phải xử lý rollback khi API lỗi (rollback UI về trạng thái trước khi submit).
- Đây là dự án dùng Next.js phiên bản có breaking changes so với kiến thức thông thường (`AGENTS.md`) — nếu đổi cách revalidate/cache dữ liệu, đọc tài liệu trong `node_modules/next/dist/docs/` trước khi áp dụng API quen thuộc.
