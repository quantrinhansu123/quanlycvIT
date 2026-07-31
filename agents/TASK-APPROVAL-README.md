# TASK - Trạng thái tự động và luồng Duyệt task con

## Mục đích

Task con (bảng `task`, trang "Danh sách Task") không còn cho chọn "Trạng thái" thủ công trong form thêm/sửa. Trạng thái được server tự tính từ tiến độ; trạng thái "Hoàn thành" chỉ đạt được khi quản trị viên bấm **Duyệt** sau khi người thực hiện báo cáo tiến độ 100%.

**Trạng thái: Đã triển khai.**

## Vị trí mã nguồn

- `src/lib/supabase/data.ts`:
  - `deriveSubtaskStatus(progress)` — suy ra `todo` (0%) / `inProgress` (1-99%) / `review` (100%).
  - `subtaskPayload()` — dùng `deriveSubtaskStatus` thay vì nhận `status` từ input khi tạo/sửa task.
  - `createSubtaskReport()` — khi báo cáo tiến độ, cập nhật `tien_do_thuc_te` và `trang_thai` trong cùng 1 lệnh `update`.
  - `assertAdminAccount(supabase)` — kiểm tra người gọi API có `role = 'admin'` trong bảng `tai_khoan`, ném lỗi 401/403 nếu không.
  - `approveSubtask(supabase, id)` — chuyển task từ `review` sang `done`; ném lỗi 400 nếu task chưa ở trạng thái `review`.
- `src/app/api/subtasks/[id]/approve/route.ts` — `POST` gọi `assertAdminAccount` rồi `approveSubtask`.
- `src/services/subtask-service.ts` — `approveSubtask(id)`.
- `src/types/subtask.ts` — `SubtaskInput` không còn field `status`.
- `src/lib/api/validation.ts` — `parseSubtaskInput` không còn parse `status` từ body.
- `src/components/subtasks/SubtaskFormModal.tsx` — đã bỏ field "Trạng thái" khỏi form thêm/sửa.
- `src/components/tasks/TaskActionMenu.tsx` — thêm prop `onApprove` (tuỳ chọn) hiển thị mục "Duyệt".
- `src/components/subtasks/SubtaskTable.tsx`, `SubtaskCard.tsx` — thêm prop `canApprove`/`onApprove`; nút/menu "Duyệt" chỉ hiện khi `canApprove && subtask.status === "review"`.
- `src/components/subtasks/WorkTaskSubtasksPanel.tsx` và `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-task/page.tsx` — nối `useCurrentAccount()` để tính `isAdmin`, truyền `canApprove`/`onApprove` xuống bảng/thẻ.
- `src/hooks/useCurrentAccount.ts` — hook mới, lấy tài khoản `tai_khoan` (kèm `role`) tương ứng phiên đăng nhập hiện tại; `src/components/layout/Header.tsx` cũng được refactor để dùng hook này thay vì tự fetch riêng.

## Hành vi chính

1. Tạo/sửa task con: không còn chọn trạng thái; trạng thái tự tính từ % tiến độ nhập trong form.
2. Gửi báo cáo tiến độ đạt 100%: task tự chuyển sang "Chờ đánh giá" (`review`).
3. Chỉ tài khoản có `role = "admin"` mới thấy nút/menu "Duyệt" trên task đang "Chờ đánh giá"; bấm Duyệt gọi `POST /api/subtasks/:id/approve`, chuyển sang "Hoàn thành".
4. API approve tự chặn (403) nếu người gọi không phải admin, và chặn (400) nếu task chưa đạt trạng thái "Chờ đánh giá".

## Phạm vi cố ý giới hạn

Theo quyết định của người dùng: luồng Duyệt + tự động trạng thái **chỉ áp dụng cho Task con**. Công việc (`cong_viec`/`TaskFormModal.tsx`) và Dự án vẫn giữ nguyên field "Trạng thái" chọn thủ công như cũ — không đụng tới khi làm việc này.

## Lưu ý khi thay đổi tiếp

- Nếu sau này mở rộng luồng Duyệt lên cấp Công việc, có thể tái dùng `assertAdminAccount` và pattern `deriveSubtaskStatus`/`approveSubtask` làm mẫu, nhưng nhớ đây là thay đổi phạm vi lớn hơn, cần xác nhận lại với người dùng trước.
- `useCurrentAccount` hiện là nguồn xác định quyền admin duy nhất ở phía client; đây chỉ là kiểm tra hiển thị (optimistic) — an toàn thật sự nằm ở `assertAdminAccount` phía server, không được bỏ qua kiểm tra đó dù client đã ẩn nút.
