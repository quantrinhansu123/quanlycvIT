# Báo cáo triển khai Giai đoạn 6 — Mutation, invalidation & độ tin cậy

Ngày triển khai: **02/08/2026**
Nguồn kế hoạch: `PERF-UNIFIED-IMPLEMENTATION-PLAN.md` (mục "Giai đoạn 6")
Báo cáo trước: `PERF-PHASE-0-1-README.md` (GĐ0 một phần → GĐ5 một phần)
Trạng thái: **Xong về mặt code + `npm run lint`/`npx tsc --noEmit`/`npm run build` đều pass — chưa tự kiểm thử tay bằng trình duyệt thật (không có tài khoản đăng nhập thật trong phiên làm việc này)**

**Cập nhật 02/08/2026 (cùng ngày, đợt sau):** đã bổ sung tiếp **Giai đoạn 7 — Lưu bản nháp form an toàn** vào cùng file báo cáo này, xem mục 6 phía dưới.

**Cập nhật 02/08/2026 (đợt sau nữa):** đã bổ sung tiếp **Giai đoạn 9 — Idempotency & mutation nguyên tử** (chỉ phần idempotency; bỏ qua GĐ8 theo yêu cầu), xem mục 7 phía dưới.

**Cập nhật 02/08/2026 (rà soát phần còn thiếu):** phần còn lại GĐ5 thực tế đã hoàn tất trong `PERF-PHASE-0-1-README.md` mục 10–11; dashboard đã nối vào cache phiên và **Giai đoạn 8 — Batch API & kiểm soát đồng thời upload** đã hoàn tất về mặt code. Các ghi chú “chưa nối dashboard” ở mục 2.3 và “GĐ5 còn lại” ở mục 5 bên dưới là lịch sử tại thời điểm viết GĐ6, đã được thay thế bởi mục 8 mới.

---

## 1. Vì sao cần Giai đoạn 6

Giai đoạn 4 (cache phiên) và Giai đoạn 5 (server initial data) đã xây xong hạ tầng `SessionDataCache` và tích hợp vào **3 trang danh sách chính** (dự án/công việc/task). Nhưng khảo sát trước khi làm GĐ6 (dùng subagent đọc code, không suy đoán) phát hiện **4 nơi mutate dữ liệu hoàn toàn đứng ngoài cache đó**:

1. **3 trang chi tiết** (`ProjectDetailView.tsx`, `TaskDetailView.tsx`, `SubtaskDetailView.tsx`) — tự `useState` + tự fetch lại bằng `load()`, không biết `SessionDataCache` tồn tại.
2. **2 panel lồng trong trang chi tiết** (`ProjectTasksPanel.tsx` — tab "Công việc" trong trang dự án; `WorkTaskSubtasksPanel.tsx` — tab "Task" trong trang công việc) — cũng tự fetch riêng, sau khi tạo/sửa/xóa/duyệt/xác nhận chỉ gọi callback `onTasksChanged()`/`onSubtasksChanged()` để trang cha tự refetch cục bộ, không đụng gì tới cache dùng chung.
3. **`AccountManagementPage.tsx`** — thêm/sửa/xóa/khóa/mở khóa/khóa-mở hàng loạt/nhập CSV tài khoản, hoàn toàn độc lập với `SessionDataCache`.
4. **Luồng duyệt/báo cáo task** ở `SubtaskListClient.tsx` (trang danh sách task chính) — đã có invalidate `subtasks-list` từ trước, nhưng **thiếu invalidate `tasks-list`** (tiến độ công việc cha tính theo trung bình các task con, nên duyệt/báo cáo/sửa task con phải làm mới cả cache công việc).

Hệ quả nếu không sửa: sau khi sửa một dự án/công việc/task ngay tại trang chi tiết hoặc panel lồng, quay lại 1 trong 3 trang danh sách chính trong vòng TTL fresh (15 giây) sẽ **thấy dữ liệu cũ** — đúng loại lỗi mà kế hoạch liệt kê là điều kiện rollback bắt buộc ("UI hiện dữ liệu cũ sau mutation >2s không có trạng thái đồng bộ", mục 7 của kế hoạch).

---

## 2. Cách sửa

Nguyên tắc chung: **không đổi kiến trúc**, chỉ nối các nơi đang "mù cache" vào đúng cơ chế `cache.invalidate(resource)` đã có sẵn từ GĐ4 (`useSessionDataCache()` + `CACHE_RESOURCE` từ `src/lib/client-cache/resources.ts`). Không tạo resource cache mới, không đổi `SessionDataCache`/`useSessionQuery` (không cần — hạ tầng GĐ4 đã đủ dùng).

### 2.1 Ma trận mutation → cache cần invalidate

| Mutation | Nơi xảy ra | Invalidate thêm (trước đây: không có gì) |
|---|---|---|
| Sửa dự án | `ProjectDetailView.tsx` (nút "Chỉnh sửa dự án") | `projects-list`, `directory-projects` |
| Tạo/sửa/xóa công việc trong tab "Công việc" của trang dự án | `ProjectTasksPanel.tsx` | `tasks-list`, `directory-tasks`, `projects-list` (project.stats.done/total đổi theo trạng thái công việc) |
| Sửa công việc (form đầy đủ) | `TaskDetailView.tsx` (nút "Chỉnh sửa công việc") | `tasks-list`, `directory-tasks`, `projects-list` |
| Đổi nhanh ưu tiên/người phụ trách công việc | `TaskDetailView.tsx` (`handleQuickUpdate`, dropdown ngay trang chi tiết) | `tasks-list`, `directory-tasks` |
| Tạo/sửa/xóa/duyệt/xác nhận task con trong tab "Task" của trang công việc | `WorkTaskSubtasksPanel.tsx` | `subtasks-list`, `tasks-list` (tiến độ công việc cha) |
| Sửa task con (form đầy đủ) | `SubtaskDetailView.tsx` (nút "Chỉnh sửa Task") | `subtasks-list`, `tasks-list` |
| Đổi nhanh ưu tiên/người thực hiện task con | `SubtaskDetailView.tsx` (`handleQuickUpdate`) | `subtasks-list`, `tasks-list` |
| Xác nhận nhận task con | `SubtaskDetailView.tsx` (`handleAccept`) | `subtasks-list`, `tasks-list` |
| Gửi báo cáo tiến độ task con | `SubtaskDetailView.tsx` (`TaskReportDrawer.onSubmitted`) | `subtasks-list`, `tasks-list` |
| Duyệt/sửa/báo cáo task con | `SubtaskListClient.tsx` (trang danh sách task chính — **đã có sẵn `subtasks-list` từ GĐ4, GĐ6 chỉ bổ sung phần thiếu**) | thêm `tasks-list` |
| Thêm/sửa/xóa/khóa/mở khóa/khóa-mở hàng loạt/nhập CSV tài khoản | `AccountManagementPage.tsx` | `directory-members` |

**Cố tình không làm:** invalidate `directory-members` trong `DepartmentManagementPage.tsx`. Đã đọc trực tiếp `ACCOUNT_SELECT` (`src/lib/supabase/data.ts:198`: `"id,ma_nv,ten_nv,chuc_vu,email,avatar_url"`) — dữ liệu `directory-members` (dùng cho dropdown chọn người phụ trách) chỉ gồm tên/chức vụ/email/avatar của tài khoản, **không có tên phòng ban**. Sửa phòng ban không làm sai lệch dữ liệu directory này, nên thêm invalidate ở đây chỉ gây fetch thừa không có lợi ích — đúng tinh thần "không đánh dấu hoàn thành chỉ vì cảm giác", ở đây là chiều ngược lại: không thêm code chỉ vì "cho chắc".

### 2.2 Rollback optimistic update

Kế hoạch yêu cầu "Rollback optimistic state khi server thất bại". Khảo sát lại cho thấy:

- 2 trang có optimistic update thật (`ProjectListClient.tsx`, `TaskListClient.tsx`, dùng `useOptimistic` từ GĐ4) — cơ chế rollback đã có sẵn và đúng chuẩn React: nếu promise trong `startTransition` reject, giá trị optimistic tự động bị loại bỏ khi transition kết thúc, không cần code tay. GĐ6 không đổi gì ở đây, chỉ xác nhận lại.
- Toàn bộ phần GĐ6 vừa nối cache (3 trang chi tiết, 2 panel lồng, tài khoản) **đều đợi API trả về thành công rồi mới `setState`** (xem ví dụ `TaskDetailView.tsx:157-160`: `if (!updated) throw ...; setTask(updated);`) — không có state lạc quan nào được ghi trước khi server xác nhận, nên **không có gì cần rollback**. Đây là hành vi an toàn đã tồn tại từ trước GĐ6, không phải khoảng trống cần vá.

### 2.3 Giới hạn đã biết — dashboard

Bảng ma trận gốc trong kế hoạch có cột "dashboard" cho hầu hết loại mutation. Thực tế: `src/app/(dashboard)/page.tsx` gọi `getDashboardData()` server-side, seed một lần vào `PerformanceDashboard.tsx` qua `useState(initialData)` — **không đọc/ghi gì từ `SessionDataCache`** (xác nhận qua khảo sát, không có `CACHE_RESOURCE` nào cho dashboard). Vì vậy không có cách nào "invalidate dashboard" bằng cơ chế hiện tại; dashboard chỉ mới khi người dùng tải lại trang. Đây là giới hạn thật, không phải sai sót khi làm GĐ6 — nối dashboard vào `SessionDataCache` là việc khác, ngoài phạm vi ma trận mutation (đòi hỏi thêm resource cache mới + đổi cách dashboard tự fetch, rủi ro/khối lượng khác hẳn việc chỉ thêm `invalidate()` ở các nơi đã dùng cache sẵn).

Thông báo (chuông ở Header) vẫn dùng cơ chế riêng có từ trước GĐ6: `window.dispatchEvent(new CustomEvent("app:notifications-changed"))` sau khi xác nhận nhận task — không đi qua `SessionDataCache`, GĐ6 giữ nguyên không đổi.

---

## 3. File thay đổi

- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/[id]/ProjectDetailView.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-cong-viec/[id]/TaskDetailView.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-task/[id]/SubtaskDetailView.tsx`
- `src/components/projects/ProjectTasksPanel.tsx`
- `src/components/subtasks/WorkTaskSubtasksPanel.tsx`
- `src/components/accounts/AccountManagementPage.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-task/SubtaskListClient.tsx` (bổ sung `tasks-list` còn thiếu ở luồng duyệt/sửa/báo cáo task con — phần này thuộc GĐ4 nhưng có lỗ hổng nên vá luôn trong đợt GĐ6 vì cùng chủ đề invalidation)

Không đổi: `src/lib/client-cache/session-data-cache.ts`, `resources.ts`, `ttl.ts`, `useSessionQuery.ts` — hạ tầng GĐ4 dùng nguyên trạng, không cần resource cache mới.

---

## 4. Đã kiểm tra

- `npm run lint` — pass, không lỗi/warning.
- `npx tsc --noEmit` — pass, không lỗi kiểu.
- `npm run build` — build production thành công (Next.js 16.2.12, Turbopack), toàn bộ 43 route lên trang không lỗi.

**Chưa kiểm tra (cần bạn tự làm bằng trình duyệt thật, đăng nhập ít nhất 1 tài khoản mỗi vai trò admin/manager/member):**

1. Mở trang danh sách dự án → bấm vào 1 dự án → sửa tên dự án → quay lại trang danh sách dự án trong vòng 15 giây: tên mới phải hiện ngay, không phải tên cũ (kiểm tra `ProjectDetailView.tsx` → `projects-list`).
2. Mở trang chi tiết dự án → tab "Công việc" → tạo một công việc mới → thoát ra trang danh sách công việc chính trong 15 giây: công việc mới phải xuất hiện (kiểm tra `ProjectTasksPanel.tsx` → `tasks-list`).
3. Mở trang chi tiết công việc → đổi nhanh "Người phụ trách" bằng dropdown ngay trang đó → mở dropdown lọc "Người phụ trách" ở trang danh sách công việc chính: phải phản ánh đúng thay đổi, không có tên cũ (kiểm tra `directory-tasks`/`tasks-list`).
4. Mở trang chi tiết công việc → tab "Task" → duyệt một task con là admin → quay lại trang danh sách công việc chính: tiến độ/trạng thái công việc cha phải cập nhật đúng, không phải số cũ (kiểm tra `WorkTaskSubtasksPanel.tsx` → `tasks-list`).
5. Là tài khoản `member`: mở task con được giao → bấm "Xác nhận nhận Task" → gửi báo cáo tiến độ → quay lại trang danh sách task chính: trạng thái/tiến độ phải mới nhất.
6. Vào "Quản lý tài khoản" → khóa 1 tài khoản đang hoạt động → mở modal tạo/sửa công việc ở bất kỳ trang nào có dropdown "Người phụ trách": tài khoản vừa khóa phải **biến mất** khỏi danh sách chọn (kiểm tra `directory-members` — đúng theo `listDirectory()` chỉ lấy `status: "active"`).
7. Sửa tên/chức vụ 1 tài khoản → mở lại dropdown người phụ trách ở trang dự án/công việc/task: tên/chức vụ mới phải hiện, không phải tên cũ.
8. Nhập CSV thêm nhiều tài khoản cùng lúc → xác nhận tài khoản mới xuất hiện ngay trong dropdown người phụ trách mà không cần tải lại toàn bộ trang.
9. (Ngoài phạm vi có thể vá ở GĐ6, chỉ để xác nhận giới hạn đã ghi ở mục 2.3) Thực hiện bất kỳ mutation nào ở trên rồi vào trang Dashboard: xác nhận số liệu dashboard **không** tự cập nhật cho tới khi tải lại trang — đây là hành vi đã biết trước, không phải lỗi mới.

---

## 5. Tiếp theo (chưa làm ở thời điểm GĐ6)

Theo đúng thứ tự ưu tiên trong `PERF-UNIFIED-IMPLEMENTATION-PLAN.md`:

- **Đo lại GĐ0 thật** bằng HAR/DevTools trên `next build && next start` — vẫn là việc còn thiếu lớn nhất xuyên suốt toàn bộ quá trình triển khai từ đầu tới giờ, chưa giai đoạn nào đo được số liệu thật.
- **Phần còn lại của GĐ5** — thu nhỏ payload (endpoint directory tối giản, tách trường list/detail cho `/api/accounts`, payload budget) + mở rộng server-side pagination cho tài khoản/nhân viên.
- ~~Giai đoạn 7 — Lưu bản nháp form an toàn~~ — **đã làm, xem mục 6 dưới đây.**
- **Nối dashboard vào cache phiên** (ngoài phạm vi ma trận GĐ6 gốc, nhưng là khoảng trống thật phát hiện được trong đợt này — xem mục 2.3) — cân nhắc làm cùng lúc với GĐ5 phần "thu nhỏ payload" vì cùng đụng vào cách dashboard/accounts lấy dữ liệu.

---

## 6. Giai đoạn 7 — Lưu bản nháp form an toàn (bổ sung 02/08/2026)

Nguồn kế hoạch: mục "Giai đoạn 7" trong `PERF-UNIFIED-IMPLEMENTATION-PLAN.md` (gốc từ `Cross-Project GĐ3`).
Trạng thái: **Xong về mặt code + `npm run lint`/`npx tsc --noEmit`/`npm run build` đều pass — chưa tự kiểm thử tay bằng trình duyệt thật.**

### 6.1 Mục tiêu

Người dùng đang nhập form tạo/sửa dự án, công việc, task hoặc giao dịch tài chính mà reload trang, mất mạng, hoặc tab bị đóng nhầm thì mất hết nội dung đã nhập. Giai đoạn 7 thêm cơ chế lưu bản nháp cục bộ (không qua server) để phục hồi được phần dữ liệu văn bản/lựa chọn cơ bản, với ràng buộc bảo mật rõ ràng theo kế hoạch: không lưu gì nhạy cảm, không tự động ghi đè dữ liệu mới hơn từ server, và dọn dẹp đúng lúc.

### 6.2 Hạ tầng mới

- **`src/hooks/useVersionedFormDraft.ts`** — hook chính:
  - `buildFormDraftKey({ accountId, formType, mode, entityId })` → khóa dạng `form-draft:{accountId}:{formType}:{mode}:{entityId ?? "new"}`. Khóa theo `accountId` ngay từ đầu là lớp bảo vệ đầu tiên chống rò draft giữa tài khoản (xem mục 6.6).
  - `useVersionedFormDraft<T>({ storageKey, entityVersion?, ttlMs?, allowPersistent? })` trả về `{ draft, scheduleSave, clearDraft, persistent, setPersistent }`.
    - Đọc draft **đúng một lần khi `storageKey` đổi** (không đọc lại liên tục) — tránh banner "có bản nháp" tự bật lại sau khi người dùng đã bấm Khôi phục/Bỏ trong cùng lượt mở form.
    - `scheduleSave(data)` debounce 800ms rồi ghi `{ schemaVersion: 1, savedAt, expiresAt, entityVersion, data }` vào `sessionStorage` (mặc định) hoặc `localStorage` (nếu `persistent === true` và `allowPersistent !== false`) — luôn xóa bản ở storage còn lại để không tồn tại 2 bản song song cho cùng key.
    - Đọc draft: bỏ qua (và tự xóa) nếu `schemaVersion` không khớp hoặc đã quá `expiresAt` (TTL mặc định 24 giờ — kế hoạch không chỉ định số cụ thể, 24h là lựa chọn hợp lý cho bản nháp form, đủ dài để phục hồi sau khi máy tắt/mở lại trong ngày, đủ ngắn để không tồn đọng vô hạn).
    - `conflict: true` nếu `entityVersion` lưu trong draft khác `entityVersion` hiện tại truyền vào hook (dùng `updatedAt` của bản ghi) — đây là cách phát hiện "bản ghi server đã đổi sau khi tạo draft" theo yêu cầu kế hoạch, xem giới hạn ở mục 6.5.
  - `clearAllFormDrafts()` — quét toàn bộ key có tiền tố `form-draft:` trong cả `sessionStorage` và `localStorage`, xóa hết. Dùng khi logout/đổi tài khoản (mục 6.4).
- **`src/components/ui/FormDraftBanner.tsx`** — 2 component UI dùng chung:
  - `FormDraftBanner`: hiện "Có bản nháp lưu lúc HH:mm dd/MM" + nút Khôi phục/Bỏ; đổi màu sang amber và thêm dòng cảnh báo khi `conflict === true`.
  - `RememberDraftToggle`: checkbox "Ghi nhớ bản nháp trên thiết bị này" — chỉ hiện ở form cho phép `allowPersistent` (3/4 form; `FinanceTransactionModal` không có).

### 6.3 Áp dụng vào 4 form — đúng thứ tự kế hoạch yêu cầu

| Form | `formType` | Trường được draft (loại `files`/`links`/`images`) | `entityVersion` dùng để phát hiện xung đột | `allowPersistent` |
|---|---|---|---|---|
| `ProjectFormModal.tsx` | `project` | `name, code, color, steps, description, startDate, endDate, managerIds, memberIds` | Không có — `Project` không có trường `updatedAt` trong kiểu dữ liệu hiện tại | `true` (có checkbox) |
| `TaskFormModal.tsx` | `task` | `title, description, projectId, assigneeIds, status, priority, startDate, dueDate, tagsText, dependsOnTaskId` | `task.updatedAt` | `true` |
| `SubtaskFormModal.tsx` | `subtask` | `title, description, workTaskId, assigneeIds, priority, startDate, dueDate, progress, tagsText` | `subtask.updatedAt` | `true` |
| `FinanceTransactionModal.tsx` | `finance-transaction` | `type, amount, date, categoryId, description` | Không có — `FinanceTransaction` chỉ có `createdAt`, không có `updatedAt` | `false` (đúng yêu cầu kế hoạch: "chỉ sessionStorage") |

Ở cả 4 form, luồng giống nhau:

1. `useEffect` theo dõi đúng các trường "được phép draft" ở bảng trên, gọi `scheduleSave(...)` mỗi khi đổi — debounce 800ms nên gõ liên tục không ghi storage liên tục.
2. Banner `FormDraftBanner` hiện ngay dưới header modal nếu có draft hợp lệ (chưa hết hạn) và người dùng chưa bấm Khôi phục/Bỏ trong lượt mở này. Bấm "Khôi phục" → `setForm((prev) => ({ ...prev, ...draft.data }))` (merge vào form hiện tại, giữ nguyên `files`/`links`/`images` đang có từ props/server — đúng yêu cầu "không tự ghi đè dữ liệu edit mới từ server" vì hành động này luôn cần người dùng bấm, không tự động). Bấm "Bỏ" → `clearDraft()`.
3. Lưu thành công (nhánh `try` sau khi API trả về, trước `onClose()`) → gọi `clearDraft()` — không để lại draft cũ sau khi đã lưu server thật.
4. `RememberDraftToggle` (trừ Finance) đặt trong footer, cạnh nút Hủy/Lưu.

### 6.4 Xóa draft khi logout/đổi tài khoản

Nối `clearAllFormDrafts()` vào đúng chỗ `SessionDataCacheProvider.tsx` đã lắng nghe `onAuthStateChange` (`SIGNED_OUT`/`SIGNED_IN`) từ GĐ4 — cùng một sự kiện dọn cả `SessionDataCache` (dữ liệu list/directory) và bản nháp form, không cần thêm listener mới.

### 6.5 Giới hạn đã biết

- **Không phát hiện xung đột được cho dự án và giao dịch tài chính** — 2 kiểu dữ liệu `Project`/`FinanceTransaction` hiện tại không có trường `updatedAt`. Banner vẫn hiện "Khôi phục/Bỏ" bình thường cho 2 form này, chỉ là không cảnh báo được "bản ghi đã đổi trên server" — nếu cần đầy đủ, phải thêm cột `updatedAt` cho 2 bảng này ở lớp dữ liệu, ngoài phạm vi một hook phía client.
- **Không draft đính kèm (`files`/`links`/`images`)** — quyết định có chủ đích, không phải thiếu sót: `pendingImages`/`pendingFiles` là `File` object (không serialize được vào `sessionStorage`/`localStorage`), còn `form.files`/`form.images`/`form.links` là URL đã lưu — giữ đơn giản bằng cách loại toàn bộ nhóm này khỏi draft, thay vì phải phân loại "URL đã xác nhận" và "URL tạm" riêng cho từng form.
- **Phát hiện xung đột dùng dữ liệu đã có trong props, không tự fetch mới** — hook không tự gọi API kiểm tra bản ghi mới nhất khi mở form; nó so `entityVersion` với đúng giá trị `task`/`subtask` mà modal đang nhận từ component cha (đã fresh trong TTL cache từ GĐ4-GĐ6). Nếu cha đang hiển thị dữ liệu stale thì việc phát hiện xung đột cũng stale theo — chấp nhận được vì đây chỉ là cảnh báo phụ, không phải nguồn sự thật.

### 6.6 File thay đổi trong GĐ7

Mới:
- `src/hooks/useVersionedFormDraft.ts`
- `src/components/ui/FormDraftBanner.tsx`

Sửa:
- `src/components/projects/ProjectFormModal.tsx`
- `src/components/tasks/TaskFormModal.tsx`
- `src/components/subtasks/SubtaskFormModal.tsx`
- `src/components/finance/FinanceTransactionModal.tsx`
- `src/components/providers/SessionDataCacheProvider.tsx` (gọi thêm `clearAllFormDrafts()` khi đăng xuất/đổi tài khoản)

Không đổi: `AccountFormModal.tsx` — cố tình không áp dụng, đúng loại trừ "không áp dụng cho mật khẩu/hồ sơ nhân sự nhạy cảm" của kế hoạch.

### 6.7 Đã kiểm tra / chưa kiểm tra

**Đã kiểm tra:**
- `npm run lint` — pass (sau khi sửa 1 lỗi `react-hooks/set-state-in-effect` bằng `eslint-disable-next-line`, đúng tiền lệ đã dùng ở GĐ1/GĐ4 cho các effect đồng bộ dữ liệu ngoài — xem `PERF-PHASE-0-1-README.md` mục 3).
- `npx tsc --noEmit` — pass.
- `npm run build` — build production thành công, không route nào lỗi.

**Chưa kiểm tra (cần bạn tự làm bằng trình duyệt thật):**

1. Mở form tạo dự án mới → gõ tên/mô tả → đợi hơn 1 giây → tải lại trang (F5) → mở lại form tạo dự án: phải thấy banner "Có bản nháp lưu lúc..." — bấm "Khôi phục" phải điền lại đúng tên/mô tả/ngày đã gõ.
2. Lặp lại bước 1 nhưng bấm "Bỏ" thay vì "Khôi phục" — mở lại form lần nữa: không còn banner, form trống như bình thường.
3. Điền form → lưu thành công → mở lại form tạo mới cùng loại: không còn thấy banner draft cũ (đã bị `clearDraft()` xóa sau khi lưu).
4. Mở form sửa một công việc → gõ vài ký tự vào mô tả → **không** đóng form, mở tab khác sửa đúng công việc đó bằng tài khoản khác (hoặc giả lập bằng cách gọi API sửa trực tiếp) → quay lại tab đầu, tải lại trang, mở lại form sửa công việc đó: banner phải hiện màu cảnh báo (amber) với dòng "Bản ghi này đã được cập nhật trên hệ thống sau đó".
5. Bật checkbox "Ghi nhớ bản nháp trên thiết bị này" ở form dự án/công việc/task → gõ vài ký tự → đóng hẳn trình duyệt (không chỉ đóng tab) → mở lại, đăng nhập lại, mở form: draft phải còn (đã lưu `localStorage`, không mất khi đóng trình duyệt như `sessionStorage`).
6. Mở form thêm giao dịch tài chính: xác nhận **không có** checkbox "Ghi nhớ bản nháp trên thiết bị này" (đúng thiết kế — chỉ `sessionStorage`).
7. Đăng xuất rồi đăng nhập lại bằng tài khoản khác trên cùng trình duyệt: mở bất kỳ form nào trong 4 form — không được thấy draft của tài khoản trước.

---

## 7. Giai đoạn 9 — Idempotency & mutation nguyên tử (bổ sung 02/08/2026)

Nguồn kế hoạch: mục "Giai đoạn 9" trong `PERF-UNIFIED-IMPLEMENTATION-PLAN.md` (gốc từ `Cross-Project GĐ4`). Theo yêu cầu, đã **bỏ qua GĐ8** (Batch API & kiểm soát đồng thời upload) để làm thẳng GĐ9.
Trạng thái: **Phần idempotency xong về mặt code + đã push migration lên database liên kết + `npm run lint`/`npx tsc --noEmit`/`npm run build` đều pass. Phần "chuyển mutation nhiều bước sang RPC transaction" CHƯA làm — xem lý do ở mục 7.4.**

### 7.1 Khảo sát trước khi sửa — xác nhận đúng vấn đề, không suy đoán

Đọc trực tiếp `src/lib/supabase/data.ts` trước khi viết bất kỳ dòng code nào:

- **`createProject`** (dòng 673-726): `insert` vào `du_an`, rồi gọi `syncProjectPeople(...)` ghi `du_an_quan_ly`/`du_an_thanh_vien` — **2 bước tuần tự, không phải 1 transaction**. Nếu bước 2 lỗi, code đã có compensating delete (`await supabase.from("du_an").delete()...`) — đây là hàm DUY NHẤT trong 3 hàm tạo có rollback từ trước.
- **`createWorkTask`** (dòng 1165-1207): `insert` vào `cong_viec`, rồi `syncAssignments(...)` ghi `cong_viec_phu_trach` — cũng 2 bước, nhưng **không có rollback nào** nếu bước 2 lỗi: trước khi sửa, một công việc có thể được tạo xong mà không có người phụ trách nếu request đứt giữa 2 bước.
- **`createSubtask`** (dòng 1528-1564): tương tự `createWorkTask`, ghi `task` rồi `task_phu_trach` — cũng thiếu rollback.
- **`createFinanceTransaction`** (`src/lib/supabase/finance.ts`): chỉ 1 `insert` vào bảng `thu_chi` — mutation đơn bảng, đã atomic tự nhiên, đúng loại trừ "không chuyển mutation đơn bảng đang nhanh sang RPC" của kế hoạch.
- **`POST /api/subtasks`** (route cũ): không gọi `requireRequestAccount` — khác với `/api/projects`/`/api/tasks` đều gọi. Không có `accountId` thì không thể gắn idempotency theo đúng account, nên phải thêm bước xác thực này trước khi làm idempotency (xem 7.3, đã xác nhận không đổi hành vi phân quyền hiện có — chỉ thêm xác thực JWT, không thêm giới hạn vai trò mới).
- `apiClient.post()` (`src/services/api-client.ts`) đã hỗ trợ truyền `headers` tùy ý qua `options` — không cần sửa file này để gửi được `Idempotency-Key`.

### 7.2 Bảng `mutation_requests` — lớp chặn race condition thật

**Migration:** `supabase/migrations/20260802000200_mutation_requests_idempotency.sql`

```sql
create table if not exists public.mutation_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tai_khoan(id) on delete cascade,
  idempotency_key uuid not null,
  scope text not null,
  status text not null default 'processing' check (status in ('processing', 'completed')),
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (account_id, idempotency_key, scope)
);
```

`unique (account_id, idempotency_key, scope)` là lớp bảo vệ **duy nhất** chống race condition — không dùng "SELECT xem đã có chưa rồi mới INSERT" như kế hoạch cấm rõ (2 request đến cùng lúc đều có thể SELECT thấy "chưa có" rồi cùng INSERT). Với unique constraint, cả 2 request đều `INSERT`, nhưng chỉ 1 thành công; request thua nhận lỗi Postgres `23505` (unique_violation) và xử lý tiếp từ đó (đọc kết quả đã lưu hoặc trả 409).

Đã `supabase db push --linked` thành công (xác nhận qua người dùng trước khi chạy) và xác minh lại bằng `supabase db query --linked` — `pg_constraint` cho bảng này có đủ 4 constraint: `_pkey`, `_account_id_fkey`, `_account_id_idempotency_key_scope_key` (unique, đúng tên cột như thiết kế), `_status_check`.

RLS: bật `enable row level security` + 1 policy `for all to authenticated using (true) with check (true)` — giống đúng mẫu đã dùng cho bảng `thu_chi` (migration `20260731000200`), vì các route API dùng client xác thực bằng JWT của người dùng (`role: authenticated`), không dùng `service_role` — quyền kiểm soát ở tầng ứng dụng (route handler), không ở RLS.

### 7.3 `withIdempotency()` — luồng xử lý

**File mới:** `src/lib/supabase/idempotency.ts`, 2 hàm export:

- `readIdempotencyKey(request)`: đọc header `Idempotency-Key`; nếu có nhưng không đúng định dạng UUID → `400`. Không có header → trả `null` (không chặn gì, coi như client cũ chưa gửi key).
- `withIdempotency<T>(supabase, { accountId, idempotencyKey, scope }, handler)`:
  1. `idempotencyKey === null` → chạy `handler()` bình thường, không có bảo vệ gì (tương thích ngược).
  2. `insert` một dòng giữ chỗ `{ account_id, idempotency_key, scope }`, status mặc định `'processing'`.
     - Insert **thành công** → chạy `handler()` (chính là `createProject`/`createWorkTask`/`createSubtask`), rồi `update` dòng giữ chỗ thành `status: 'completed'` kèm `response_status`/`response_body`. Nếu `handler()` throw → **xóa hẳn** dòng giữ chỗ (không update thành `completed`) để lần gửi lại sau (cùng key, sau khi người dùng sửa lỗi) được coi là thao tác hoàn toàn mới, không bị kẹt vĩnh viễn ở `409`.
     - Insert **lỗi `23505`** (đã có dòng cùng `account_id + idempotency_key + scope`) → đọc lại dòng đó:
       - `status = 'completed'` → trả thẳng `response_status`/`response_body` đã lưu — **đây chính là hành vi "trả lại kết quả cũ cho request lặp"** mà kế hoạch yêu cầu, không tạo bản ghi nghiệp vụ lần 2.
       - `status = 'processing'` (request khác đang chạy đúng lúc này, hoặc lần trước crash giữa chừng chưa kịp `update`/`delete`) → ném lỗi `409` "đang được xử lý hoặc đã gửi trước đó". `409` không thuộc nhóm status GET/HEAD được `api-client.ts` tự retry (xem GĐ3) và đây là mutation nên vốn dĩ không tự retry — client chỉ thấy toast lỗi, không tạo bản ghi trùng.
     - Insert lỗi khác (không phải `23505`) → log và chạy `handler()` bình thường — idempotency chỉ là lớp bảo vệ phụ, một lỗi hạ tầng ở bảng phụ này không được phép chặn hẳn thao tác chính.

### 7.4 Nối vào 3 route POST + rollback còn thiếu — và vì sao KHÔNG viết RPC ngay

**Đã nối `withIdempotency` vào:**
- `POST /api/projects` — `scope: "create-project"`.
- `POST /api/tasks` — `scope: "create-task"`.
- `POST /api/subtasks` — `scope: "create-subtask"`; thêm `requireRequestAccount` vào route này (trước đây thiếu, xem 7.1) chỉ để lấy `accountId`, **không** thêm `assertManagerOrAdmin` (route này trước đây không giới hạn theo vai trò — giữ nguyên, quyền tạo task con vẫn do `assertWorkTaskAssignees` bên trong `createSubtask` quyết định như cũ).

**Đã thêm compensating rollback** ở `createWorkTask`/`createSubtask` (`src/lib/supabase/data.ts`) — bọc `syncAssignments(...)` trong `try/catch`, lỗi thì `delete` bản ghi chính vừa tạo rồi throw lại — mirror đúng mẫu `createProject` đã có. Đây **không phải RPC transaction thật**: vẫn là 2 round-trip network riêng biệt (insert bản ghi chính → insert bảng gán người phụ trách), vẫn còn khe hở race rất nhỏ giữa 2 bước (ví dụ 1 request khác đọc thấy bản ghi chính trong khoảng khắc chưa có người phụ trách) — nhưng thu hẹp đáng kể so với "không rollback gì" trước khi sửa.

**Vì sao chưa viết RPC transaction ngay trong đợt này** (mục kế hoạch yêu cầu "Chuyển mutation nhiều bước sang RPC transaction... RPC phải kiểm tra quyền, validate input, rollback toàn bộ nếu lỗi"):

- Mỗi hàm tạo hiện có logic **trải trên nhiều hàm phụ trợ TypeScript** — `resolveAccounts` (resolve + validate người dùng tồn tại), `assertProjectParticipants`, `assertWorkTaskAssignees`, `assertWorkTaskScheduleWithinProject`, `assertSubtaskScheduleWithinWorkTask` — viết lại đúng 100% các quy tắc này bằng PL/pgSQL, cộng thêm phân quyền (`assertManagerOrAdmin`) và validate input (`parseProjectInput`/`parseWorkTaskInput`/`parseSubtaskInput` hiện đang ở tầng route TypeScript), là một khối lượng công việc lớn, dễ sai lệch hành vi ở các trường hợp biên (edge case) mà không có môi trường kiểm thử tương tác thật để xác nhận từng bước.
- Kế hoạch tự xếp hạng GĐ9 là "rủi ro cao" — viết RPC sai một chỗ (vd. thiếu 1 điều kiện `assert*`) có thể mở lỗ hổng phân quyền nghiêm trọng hơn hẳn lợi ích đo được ở quy mô dữ liệu hiện tại (dev/test, vài chục dòng — xem GĐ2). Ưu tiên phần "idempotency" (giá trị rõ, rủi ro thấp hơn, đã làm xong) trước phần "RPC" (giá trị cũng rõ nhưng rủi ro cao hơn nhiều) là cách chia nhỏ đúng theo nguyên tắc rollout của kế hoạch (mục 7: "mỗi giai đoạn phải là commit độc lập... không gộp nhiều thay đổi rủi ro khác nhau vào một lần phát hành").
- **Để làm đúng khi quay lại**, gợi ý cho vòng sau: viết RPC cho `createProject` trước (đơn giản nhất trong 3 — ít điều kiện `assert*` phụ thuộc lịch dự án khác so với `createWorkTask`/`createSubtask`), kiểm thử kỹ bằng tài khoản thật cả 3 vai trò, rồi mới làm tiếp `createWorkTask`/`createSubtask`.

**Cũng chưa làm** (đúng như kế hoạch tự đặt điều kiện): bật retry tự động cho POST tạo dữ liệu ở `api-client.ts` khi lỗi mạng không rõ server đã ghi — kế hoạch ghi rõ "sau khi idempotency được kiểm thử, mới cho phép" — idempotency mới xong về code, chưa qua kiểm thử tay thật (xem 7.6), nên chưa đủ điều kiện bật bước này.

### 7.5 File thay đổi trong GĐ9

Mới:
- `supabase/migrations/20260802000200_mutation_requests_idempotency.sql`
- `src/lib/supabase/idempotency.ts`

Sửa:
- `src/app/api/projects/route.ts`, `src/app/api/tasks/route.ts`, `src/app/api/subtasks/route.ts` (nối `withIdempotency`)
- `src/lib/supabase/data.ts` (rollback `createWorkTask`/`createSubtask`)
- `src/services/project-service.ts`, `task-service.ts`, `subtask-service.ts` (`createX` nhận `options?.idempotencyKey`)
- `src/components/projects/ProjectFormModal.tsx`, `src/components/tasks/TaskFormModal.tsx`, `src/components/subtasks/SubtaskFormModal.tsx` (sinh UUID ổn định qua `useState` lazy-init, forward xuống service/`onSave`)
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/ProjectListClient.tsx`, `danh-sach-cong-viec/TaskListClient.tsx` (`saveProject`/`saveTask` nhận thêm tham số `idempotencyKey`, forward vào `createProject`/`createTask`)

Không đổi: `src/services/api-client.ts` (đã hỗ trợ header tùy ý từ trước, không cần sửa để gửi `Idempotency-Key`); không bật retry POST (xem 7.4).

### 7.6 Đã kiểm tra / chưa kiểm tra

**Đã kiểm tra:**
- `npm run lint`, `npx tsc --noEmit`, `npm run build` — đều pass.
- `supabase db push --linked` áp dụng migration thành công (có hỏi xác nhận người dùng trước khi chạy).
- `supabase db query --linked` xác nhận cả 4 constraint của `mutation_requests` tồn tại đúng như thiết kế, đặc biệt là unique constraint `(account_id, idempotency_key, scope)`.

**Chưa kiểm tra (cần bạn tự làm — đây là phần quan trọng nhất còn thiếu của GĐ9):**

1. Mở 2 tab, đăng nhập cùng 1 tài khoản, mở form tạo dự án ở cả 2 tab với **cùng nội dung** — không thể tự tạo cùng idempotency key từ UI thật (key sinh ngẫu nhiên mỗi lần mở form), nên kịch bản test đúng nghĩa cần công cụ gọi API trực tiếp (Postman/curl) gửi 2 request `POST /api/projects` đồng thời với cùng header `Idempotency-Key: <cùng 1 UUID>` — xác nhận chỉ 1 dự án được tạo trong bảng `du_an`, request thứ 2 nhận lại đúng response của request thứ 1 (hoặc lỗi 409 nếu request 1 chưa xử lý xong).
2. Gửi lại đúng request ở bước 1 (cùng Idempotency-Key) sau khi request đầu đã hoàn tất — xác nhận nhận lại đúng dự án cũ (`response_body` đã lưu), không tạo dự án thứ 2.
3. Thử tạo công việc/task con với 1 người phụ trách không tồn tại (giả) để `syncAssignments` thất bại — kiểm tra bảng `cong_viec`/`task` không còn sót lại bản ghi "công việc/task không người phụ trách" (compensating delete có chạy đúng).
4. Kiểm tra bảng `mutation_requests` sau vài lần tạo dự án/công việc/task thành công thật — mỗi dòng phải có `status = 'completed'` và `response_body` là JSON hợp lệ của bản ghi đã tạo.
5. Tạo dự án/công việc/task ở 3 vai trò admin/manager/member (member không được tạo dự án/công việc — xác nhận vẫn bị chặn 403 như cũ; member vẫn tạo được task con như cũ) — xác nhận không có thay đổi hành vi phân quyền nào ngoài dự kiến.

---

## 8. Rà soát và làm nốt — Dashboard cache + Giai đoạn 8 (bổ sung 02/08/2026)

### 8.1 Dashboard không còn là khoảng trống invalidation

- Thêm `CACHE_RESOURCE.dashboard` và TTL SWR 15 giây fresh / 120 giây stale.
- `getDashboardData()` trả kèm `accountId` + `accountRole`; `PerformanceDashboard` dùng hai giá trị này để tạo cache key đúng ranh giới quyền, seed dữ liệu server qua `useSessionQuery`, và refresh không bật skeleton toàn trang.
- `SessionDataCache` hỗ trợ dependency invalidation được cấu hình tại provider: invalidate `projects-list`, `tasks-list`, `subtasks-list` hoặc `directory-members` sẽ tự invalidate mọi entry dashboard. Vì vậy các mutation GĐ6 hiện có không cần rải thêm lệnh invalidate dashboard ở từng component.

### 8.2 Batch tài khoản

- Thêm `POST /api/accounts/batch` cho nhập tối đa 100 tài khoản bằng một insert mảng. Route parse/validate toàn bộ item trước khi ghi; nhập CSV không còn gọi tuần tự N request.
- Thêm `PATCH /api/accounts/batch` cho khóa/mở tối đa 100 tài khoản. Server validate status, UUID, duplicate và sự tồn tại của toàn bộ target trước khi chạy một `.update().in(...)`; UI kiểm tra số bản ghi trả về khớp số đã chọn.

### 8.3 Upload có giới hạn và giữ kết quả thành công

- `src/lib/upload-concurrency.ts` cung cấp hàng đợi dùng chung, mặc định tối đa 4 upload đồng thời và trả riêng `succeededIds`/`failures`.
- Form dự án/công việc/task/giao dịch chuyển file upload thành công vào state URL đã lưu và xóa đúng file đó khỏi pending. Nếu file khác lỗi, file lỗi vẫn ở pending; lần bấm Lưu sau chỉ upload lại phần lỗi.
- Route báo cáo task giới hạn 10 ảnh + 10 tệp phía server, upload tối đa 4 file đồng thời, chỉ tạo báo cáo sau khi toàn bộ upload thành công và cleanup file đã tải nếu batch hoặc bước lưu metadata thất bại.

### 8.4 Đã kiểm tra

- `npm run lint` — pass.
- `npx tsc --noEmit` — pass.
- `npm run build` — pass trên Next.js 16.2.12; route mới `/api/accounts/batch` xuất hiện trong production build.
- Test runtime `runUploadBatch` với 9 job (1 job cố ý lỗi): `maxConcurrent = 4`, 8 success và 1 failure vẫn được ghi nhận độc lập.

### 8.5 Còn phụ thuộc môi trường hoặc cố ý chưa làm

- Cần phiên đăng nhập thật để smoke test batch account/CSV và upload lỗi từng phần trên UI, cũng như toàn bộ ma trận admin/manager/member ở mục 4 và 7.6.
- Chưa bật retry tự động POST tạo dự án/công việc/task: chỉ bật sau khi idempotency được kiểm thử tích hợp thật đúng điều kiện GĐ9.
- Chưa chuyển ba mutation nhiều bảng sang PL/pgSQL RPC transaction. Đây vẫn là hạng mục rủi ro cao cần bộ test quyền/validation/rollback và rollout riêng; đợt này không suy đoán rồi sao chép logic TypeScript sang database.
- GĐ11 đã có request id, Server-Timing, structured log và pipeline Web Vitals. Percentile/cảnh báo production cần dữ liệu đại diện đủ lâu và một alert sink bên ngoài; không thể kết luận bằng build cục bộ.
