# TASK — Luồng QA: Người thực hiện → Tester → Admin duyệt

## Trạng thái: **Kế hoạch (chưa triển khai)**

## Mục đích

Mở rộng luồng trạng thái tự động của Task con (xem [`TASK-APPROVAL-README.md`](./TASK-APPROVAL-README.md)) để thêm một bước **kiểm thử (test)** trước khi admin duyệt:

```
Cần làm → Đang làm → Chờ test (tester) → Chờ duyệt (admin) → Hoàn thành
                          ↑                    │
                          └──── Fail ──────────┘
                     (Đang làm, tiến độ về 99%)
```

- Người thực hiện báo cáo tiến độ 100% + bấm nút "Gửi cho Tester" → task chuyển "Chờ test", tester được gán cho task đó nhận thông báo và thấy task trong danh sách "Cần test" của mình.
- Tester test xong:
  - **Pass** → task chuyển "Chờ duyệt", admin duyệt như luồng hiện tại → "Hoàn thành".
  - **Fail** → task quay về "Đang làm", tiến độ tự đặt lại 99%, người thực hiện nhận thông báo kèm ghi chú lỗi. Người thực hiện sửa xong, báo cáo lại 100% → quay lại "Chờ test" (vòng lặp).

## Quyết định thiết kế đã chốt với người dùng

1. **Tester gán theo từng task**, không phải role toàn cục. Mỗi task con có một "Người test" cụ thể (tương tự "Người phụ trách"), không phải bất kỳ ai có role tester đều thấy mọi task.
2. **Giữ cả 2 bước**: Tester test trước → Admin duyệt sau. Bước duyệt của admin ([`approveSubtask`](../src/lib/supabase/data.ts)) không bị thay thế, chỉ dời xuống sau bước test.
3. **Fail → "Đang làm", tiến độ về 99%** (không về 0%) — người thực hiện chỉ cần báo cáo lại để quay lại hàng chờ test, không phải làm lại từ đầu.

## Phạm vi

Chỉ áp dụng cho **Task con** (bảng `task`), giống hệt phạm vi của luồng duyệt hiện tại. **Không đụng tới Công việc** (`cong_viec`/`TaskFormModal.tsx`) — giữ nguyên quyết định trước đó trong `TASK-APPROVAL-README.md`.

---

## 1. Thay đổi trạng thái (status)

Thêm 1 giá trị trạng thái mới: **`testing`** ("Chờ test"), chen giữa `inProgress` và `review`.

### `src/types/task.ts`

```ts
export type TaskStatus = "todo" | "inProgress" | "testing" | "review" | "done";

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "Cần làm" },
  { value: "inProgress", label: "Đang làm" },
  { value: "testing", label: "Chờ test" },
  { value: "review", label: "Chờ duyệt" },
  { value: "done", label: "Đã hoàn thành" },
];
```

Thêm entry tương ứng trong `TASK_STATUS_META` (đề xuất màu tím/violet cho `testing`, khác `review` amber và `done` emerald để phân biệt trực quan).

**Lưu ý quan trọng**: `deriveWorkTaskStatus()` (tính trạng thái hiển thị của Công việc cha từ các task con) hiện chỉ coi `done` là hoàn tất — cần kiểm tra logic này không bị vỡ khi có task con ở trạng thái `testing`/`review` (nó nên tiếp tục coi những trạng thái này là "chưa xong", không cần đổi gì nếu logic hiện tại chỉ check `=== "done"`).

### Database — 2 migration mới cần thiết

**a) Mở rộng check constraint `trang_thai` trên bảng `task`:**
```sql
alter table public.task drop constraint if exists task_trang_thai_check;
alter table public.task
  add constraint task_trang_thai_check
  check (trang_thai in ('todo', 'in_progress', 'testing', 'review', 'done'));
```
(Tên constraint thực tế cần xác nhận lại trong `20260729000100_initial_schema.sql` trước khi viết migration.)

**b) Cập nhật constraint đồng bộ tiến độ/trạng thái** (`task_approval_progress_consistent`, xem `20260731000300_enforce_subtask_approval_progress.sql` / `20260803000100_sync_subtask_status_progress.sql`):
```sql
alter table public.task drop constraint if exists task_approval_progress_consistent;
alter table public.task
add constraint task_approval_progress_consistent check (
  (trang_thai = 'todo' and tien_do_thuc_te = 0)
  or (trang_thai = 'in_progress' and tien_do_thuc_te > 0 and tien_do_thuc_te < 100)
  or (trang_thai in ('testing', 'review', 'done') and tien_do_thuc_te = 100)
);
```

**c) Cập nhật trigger `sync_task_progress_from_status()`** để xử lý case mới: khi set `trang_thai = 'testing'` hoặc `'review'`, ép `tien_do_thuc_te = 100` (giống `review`/`done` hiện tại).

**d) Thêm cột gán tester cho task:**
```sql
alter table public.task
  add column nguoi_test_id uuid references public.tai_khoan(id) on delete set null;
```
Cân nhắc index `create index if not exists idx_task_nguoi_test_id on public.task(nguoi_test_id);` vì sẽ query theo cột này để hiển thị "Task cần test của tôi".

**e) (Tuỳ chọn nhưng khuyến nghị) Cột ghi lý do fail:**
```sql
alter table public.task
  add column ghi_chu_test text;
```
Lưu ghi chú/lý do lỗi lần test gần nhất, hiển thị lại cho người thực hiện. Nếu cần lưu *lịch sử* nhiều lần fail thay vì chỉ lần gần nhất, cân nhắc bảng `bao_cao_task` hiện có (dùng cho báo cáo tiến độ) — có thể tái dùng cơ chế đó thay vì tạo bảng mới, cần xem lại schema `bao_cao_task` trước khi quyết định.

---

## 2. Types

### `src/types/subtask.ts`
- Thêm `testerId?: string` và `tester?: AccountSummary` (theo pattern `assigneeId`/`assignees` đã có) vào `Subtask`.
- Thêm `testerId?: string` vào `SubtaskInput` (để chọn/đổi tester khi tạo/sửa task con — tuỳ chọn, không bắt buộc).
- Thêm kiểu cho hành động test, ví dụ:
```ts
export interface SubtaskTestResult {
  passed: boolean;
  note?: string; // bắt buộc khi passed = false
}
```

### `src/types/notification.ts`
Thêm 2 loại thông báo mới:
```ts
export type AppNotificationType = "taskAssigned" | "taskNeedsTesting" | "taskTestFailed";
```

---

## 3. Backend (`src/lib/supabase/data.ts`)

### a) Sửa `deriveSubtaskStatus`
Không tự động nhảy tới `review` nữa khi progress = 100 — dừng ở `testing` (nếu có tester) là bước kế tiếp hợp lý. Nhưng vì việc chuyển sang `testing` cần có **hành động rõ ràng của người dùng** ("Gửi cho Tester", theo yêu cầu gốc) thay vì tự động hoàn toàn, cách tiếp cận đề xuất:

- `deriveSubtaskStatus(progress)` vẫn trả `review`-tương-đương cũ nhưng đổi tên ý nghĩa: khi progress đạt 100 qua **báo cáo thường**, trạng thái dừng ở mức trung gian chờ hành động — thực tế đơn giản nhất là: **nút "Gửi cho Tester" chính là hành động submit báo cáo khi progress = 100%**, không tách thành 2 bước riêng. Tức là:
  - Nếu progress = 100 **và** task đã có `nguoi_test_id` → set `trang_thai = 'testing'` luôn trong `createSubtaskReport` (giữ hành vi tự động như hiện tại, chỉ đổi đích đến từ `review` sang `testing`).
  - Nếu progress = 100 **nhưng chưa có** `nguoi_test_id` → form báo cáo bắt buộc chọn tester ngay trong dialog báo cáo (nút đổi label thành "Gửi cho Tester", có picker chọn người) trước khi cho submit — đây chính là "nút báo cáo cho tester biết" mà người dùng mô tả.

  → Cần 1 hàm mới `createSubtaskReport` nhận thêm `testerId?: string` trong `TaskReportInput`; nếu progress = 100 và có `testerId` (mới chọn hoặc đã có sẵn), set `trang_thai = 'testing'` + lưu `nguoi_test_id` nếu chưa có.

### b) Hàm mới: `assertTesterOfTask(supabase, taskId)` hoặc kiểm tra tổng quát hơn
Vì tester gán theo task, không theo role toàn cục — không dùng lại `assertAdminAccount`. Cần hàm kiểm tra người gọi API chính là `nguoi_test_id` của task đó (hoặc là admin, để admin luôn có quyền override):
```ts
export async function assertTesterOfSubtask(
  supabase: ApiSupabaseClient,
  taskId: string
): Promise<void> {
  const authUserId = await resolveAuthUserId(supabase);
  if (!authUserId) throw new ApiException("Bạn cần đăng nhập để thực hiện thao tác này.", 401);
  const { data: account } = await supabase
    .from("tai_khoan").select("id, role").eq("auth_user_id", authUserId).maybeSingle();
  if (!account) throw new ApiException("Không tìm thấy tài khoản.", 403);
  if (account.role === "admin") return; // admin luôn có quyền
  const { data: task } = await supabase
    .from("task").select("nguoi_test_id").eq("id", taskId).maybeSingle();
  if (!task || task.nguoi_test_id !== account.id) {
    throw new ApiException("Chỉ người được gán test task này mới được thao tác.", 403);
  }
}
```

### c) Hàm mới: `submitSubtaskTestResult(supabase, id, result: SubtaskTestResult)`
```ts
export async function submitSubtaskTestResult(
  supabase: ApiSupabaseClient,
  id: string,
  result: SubtaskTestResult
): Promise<Subtask | null> {
  const subtask = await getSubtask(supabase, id);
  if (!subtask) return null;
  if (subtask.status !== "testing") {
    throw new ApiException("Chỉ có thể ghi kết quả test khi task đang ở trạng thái Chờ test.", 400);
  }
  if (!result.passed && !result.note?.trim()) {
    throw new ApiException("Cần ghi rõ lỗi khi báo Fail.", 400);
  }
  const update = result.passed
    ? { trang_thai: toDatabaseStatus("review") }
    : { trang_thai: toDatabaseStatus("inProgress"), tien_do_thuc_te: 99, ghi_chu_test: result.note };
  const { data, error } = await supabase
    .from("task").update(update).eq("id", id).select(SUBTASK_SELECT).maybeSingle();
  throwDatabaseError(error);
  // TODO: insert thông báo — xem mục 5
  if (!data) return null;
  const [updated] = hydrateSubtasks([data as unknown as SubtaskRow]);
  return updated;
}
```

### d) `approveSubtask` — không cần đổi logic, chỉ cần đảm bảo nó vẫn chỉ chạy khi `status === "review"` (đã đúng sẵn), giờ `review` chỉ đạt được sau khi tester Pass.

---

## 4. API routes & Services

- `src/app/api/subtasks/[id]/test-result/route.ts` — `POST`, gọi `assertTesterOfSubtask` rồi `submitSubtaskTestResult`. Body: `{ passed: boolean; note?: string }`.
- `src/services/subtask-service.ts` — thêm `submitTestResult(id, result)`.
- Nếu cho phép chọn/đổi tester ngay trong form báo cáo: `createSubtaskReport`/route báo cáo hiện có (`src/app/api/subtasks/[id]/report/...` — cần xác nhận đường dẫn thật) nhận thêm field `testerId`.

---

## 5. Notification (mở rộng `thong_bao`)

### DB
```sql
alter table public.thong_bao drop constraint if exists thong_bao_loai_check;
alter table public.thong_bao
  add constraint thong_bao_loai_check
  check (loai in ('task_assigned', 'task_needs_testing', 'task_test_failed'));
```

Hai lựa chọn để tạo thông báo `task_needs_testing`:
- **Trigger DB** (nhất quán với `tao_thong_bao_task_duoc_giao`): `after update of trang_thai on task when (new.trang_thai = 'testing' and old.trang_thai is distinct from 'testing')`, insert vào `thong_bao` cho `new.nguoi_test_id`.
- **Application-level** trong `createSubtaskReport`/`submitSubtaskTestResult`: đơn giản hơn, dễ kiểm soát nội dung tiếng Việt động (tên task, người báo cáo), khuyến nghị dùng cách này để nhất quán với cách các API khác trong `data.ts` đang tự viết logic nghiệp vụ ở tầng app thay vì trigger, và tránh phải viết 2 trigger riêng (needs-testing / test-failed).

`task_test_failed` insert cho `nguoi_phu_trach_id` (người thực hiện) khi `submitSubtaskTestResult` nhận `passed: false`, nội dung nên nhúng `result.note`.

### Frontend
- `src/types/notification.ts`, `hydrateNotification` — map 2 loại mới sang label hiển thị (vd: "🧪 Task cần test: {tên task}", "❌ Test thất bại: {tên task} — {ghi chú}").
- `src/components/layout/Header.tsx` — không cần đổi cấu trúc, chỉ cần loại mới render đúng qua map trong bước trên (component hiện đã generic theo `type`).

---

## 6. UI

### a) `SubtaskFormModal.tsx`
Thêm field chọn "Người test" (optional, single-select account picker giống "Người phụ trách" hiện có) — cho phép gán trước khi báo cáo, tránh phải chọn gấp lúc report 100%.

### b) Form báo cáo tiến độ (component report — cần xác nhận tên file chính xác, khả năng là trong `WorkTaskSubtasksPanel.tsx` hoặc 1 modal riêng `SubtaskReportModal.tsx`)
- Khi progress nhập = 100:
  - Nếu task đã có `testerId` → nút submit đổi label "Gửi cho Tester {tên}".
  - Nếu chưa có → hiện thêm picker chọn tester ngay trong form, bắt buộc chọn trước khi submit được ở mức 100%.

### c) `SubtaskTable.tsx` / `SubtaskCard.tsx` / `TaskActionMenu.tsx`
Thêm props `canTest`/`onPassTest`/`onFailTest` (pattern giống `canApprove`/`onApprove`), hiện nút/menu "Pass" và "Fail" (Fail mở dialog nhỏ nhập ghi chú lỗi bắt buộc) khi `subtask.status === "testing"` **và** (`currentAccount.id === subtask.testerId` hoặc `isAdmin`).

### d) Màn hình "Task cần test" cho tester
Theo yêu cầu "màn hình tester sẽ hiện task đó cần dc test" — cần 1 view lọc: task có `nguoi_test_id === currentAccount.id` và `status === 'testing'`. Đơn giản nhất: thêm bộ lọc/tab trong trang danh sách task hiện có (`danh-sach-task/page.tsx`) — ví dụ tab "Cần tôi test" bên cạnh các tab hiện có, thay vì tạo trang mới hoàn toàn. Cần xác nhận cấu trúc trang hiện tại có tab/filter sẵn hay phải thêm mới.

### e) `WorkTaskSubtasksPanel.tsx`
Nối thêm tính toán `canTest` từ `useCurrentAccount()` tương tự `isAdmin`, truyền xuống bảng/thẻ.

---

## 7. Việc cần xác nhận thêm trước khi code (không tự quyết định)

1. **Vị trí chính xác của form báo cáo tiến độ** (component nào render nút "Gửi báo cáo") — subagent research chưa xác nhận file cụ thể, cần đọc `WorkTaskSubtasksPanel.tsx` và tìm modal report thật trước khi sửa.
2. **Tên chính xác của constraint** `task_trang_thai_check` trong migration gốc — cần đọc lại `20260729000100_initial_schema.sql` để lấy đúng tên trước khi viết `DROP CONSTRAINT`.
3. **Lưu lịch sử fail hay chỉ lần gần nhất** — nếu cần xem lại toàn bộ lịch sử test (nhiều vòng fail/pass), nên tái dùng bảng `bao_cao_task` thay vì 1 cột `ghi_chu_test` duy nhất bị ghi đè mỗi lần.
4. **Ai được phép đổi/gán lại tester sau khi đã set** — chỉ admin, hay cả người phụ trách task cũng được chọn tester?

## 8. Không đụng tới

- `cong_viec` / `TaskFormModal.tsx` — giữ nguyên trạng thái thủ công, không thêm `testing` vào enum trạng thái Công việc.
- `assertAdminAccount` / `approveSubtask` — giữ nguyên logic, chỉ thay đổi *khi nào* task đạt trạng thái `review` (giờ chỉ đạt được sau khi tester Pass, không còn đạt trực tiếp từ báo cáo 100%).
- Role `admin/manager/member` trong `tai_khoan` — không thêm role `tester` mới (theo quyết định gán theo task, không theo role).

## 9. Thứ tự triển khai đề xuất

1. Migration: thêm `testing` vào enum trạng thái, cột `nguoi_test_id`, `ghi_chu_test`, cập nhật 2 constraint + trigger đồng bộ progress.
2. Types: `TaskStatus`, `Subtask`, `SubtaskInput`, `AppNotification`.
3. Backend: sửa `createSubtaskReport`, thêm `assertTesterOfSubtask`, `submitSubtaskTestResult`, thông báo.
4. API route `test-result` + service.
5. UI: field chọn tester trong `SubtaskFormModal`, nút Pass/Fail trong bảng/thẻ, picker tester trong form báo cáo, tab "Cần tôi test".
6. Test thủ công toàn bộ vòng lặp: báo cáo 100% → chọn tester → tester thấy thông báo + task trong tab của mình → Fail → người thực hiện nhận thông báo, task về Đang làm 99% → báo cáo lại 100% → Pass → Chờ duyệt → Admin duyệt → Hoàn thành.
