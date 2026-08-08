# Kế hoạch tối ưu hiệu năng hợp nhất

Ngày lập: **02/08/2026**
Trạng thái: **Đang triển khai — GĐ0 (một phần) + GĐ1→GĐ8 + GĐ9 (chỉ phần idempotency, chưa làm RPC transaction) + GĐ10 (audit) xong về mặt code; dashboard đã nối cache phiên; GĐ11 có instrumentation nhưng còn chờ dữ liệu production/cảnh báo ngoài hệ thống; chờ baseline/kiểm thử đủ vai trò và GĐ9 RPC**
Nguồn gộp từ:
- `PERF-BACKEND-API-DIAGNOSIS-README.md` (chẩn đoán nguyên nhân)
- `PERF-INSTANT-NAVIGATION-IMPLEMENTATION-PLAN.md` (điều hướng tức thời, cache phiên, prefetch)
- `PERF-CROSS-PROJECT-OPTIMIZATION-PLAN.md` (độ tin cậy mạng, index DB, idempotency, batch)

Ba tài liệu trên có nhiều phần **trùng nguyên nhân gốc** (delay cố định 300ms, thiếu AbortController/race condition, thiếu index tìm kiếm/phân trang, gọi API lấy toàn bộ dữ liệu cho dropdown). Tài liệu này sắp xếp lại thành **một trình tự duy nhất theo rủi ro và tác động**, không triển khai lần lượt từng file gốc.

---

## 1. Mục tiêu chung

1. Trang vào nhanh, chuyển trang mượt, không trắng màn hình khi bấm menu/mở bản ghi.
2. Danh sách phản hồi nhanh khi tìm kiếm, lọc, phân trang, thêm/sửa/xóa.
3. Lưu dữ liệu ổn định, không tạo bản ghi trùng khi mạng chập chờn.
4. Không lộ dữ liệu giữa các tài khoản/vai trò khi thêm cache.
5. Đo được bằng số liệu (p50/p95, payload, số request) trước và sau mỗi giai đoạn — không kết luận bằng cảm giác UI.

## 2. Kết luận chẩn đoán làm nền cho toàn bộ kế hoạch

Từ `PERF-BACKEND-API-DIAGNOSIS-README.md`, độ tin cậy **trung bình đến cao**:

| Khu vực | Nhận định | Bằng chứng |
|---|---|---|
| API trang đầu đã phân trang | Không phải điểm nghẽn chính | Median cũ ~50–112 ms, payload ~37–44 KB |
| Tìm kiếm công việc/task | Nghẽn backend/DB đã xác nhận | `ILIKE '%term%'` gây `Seq Scan`; median 238–265 ms, >1s khi 20 request đồng thời |
| Phân trang sâu | Nghẽn backend/DB đã xác nhận | Offset qua `.range()`, chi phí tăng theo trang (175–252 ms ở trang 400/800) |
| Mở trang danh sách | Có độ trễ frontend | 3 trang danh sách chờ timer 300 ms trước khi gọi API |
| Trang công việc/task | Request dư/payload không giới hạn | Gọi thêm API lấy toàn bộ công việc/dự án/danh bạ chỉ để làm filter/dependency |
| Xác thực API | Đã tối ưu một phần, vẫn có chi phí | `requireRequestAccount()` đọc bảng `tai_khoan` mỗi API |
| Đo chi tiết API | Chưa đủ dữ liệu | Chưa có `Server-Timing`, request ID, log tách auth/DB/serialize |

**Kết luận:** có nghẽn thật ở backend (tìm kiếm, tải đồng thời, trang sâu), nhưng **không được quy toàn bộ chậm cho backend** vì frontend đang cộng thêm ít nhất 300ms và nhiều request phụ dư thừa. Đây là lý do kế hoạch bắt đầu bằng đo lường, sau đó song song sửa cả hai phía theo mức rủi ro tăng dần.

## 3. Nguyên tắc bắt buộc xuyên suốt

### Cache & bảo mật (áp dụng khi có bất kỳ cache nào, phiên hay dùng chung)

- Khóa cache tối thiểu: `accountId + role + resource + normalizedFilters + page + pageSize`.
- Cache phiên chỉ tồn tại trong bộ nhớ trình duyệt ở giai đoạn đầu; không dùng `localStorage`/service worker cho payload nghiệp vụ.
- Xóa toàn bộ cache khi logout, đổi tài khoản, hết phiên.
- Không dùng cache của `admin` cho `manager/member`.
- Dữ liệu phân quyền, phê duyệt, tài chính revalidate sớm hơn dữ liệu directory.
- Request cùng cache key đang chạy phải deduplicate; response cũ không được ghi đè response mới (dùng sequence id/AbortController).
- Giới hạn kích thước/entry cache (LRU hoặc giới hạn cứng).
- Không cache-first các endpoint `/api/**` chứa dữ liệu theo quyền; mọi GET hiện dùng `cache: "no-store"` là đúng cho tới khi có cơ chế cache phiên kiểm soát được.

### Mạng & độ tin cậy

- Timeout mặc định cho mọi request ra ngoài.
- GET/HEAD có thể retry có giới hạn; POST/PUT/PATCH/DELETE chỉ retry khi có idempotency key.
- Validation 4xx không retry; 401/403 không retry.
- 408/429/502/503/504 và lỗi mạng có thể retry với backoff + jitter, tôn trọng `Retry-After`.

### Không sao chép nguyên trạng dự án tham chiếu

- Không cache-first API theo quyền, không lưu mật khẩu/token/lương/số tài khoản ngân hàng vào `localStorage`.
- Không tự retry mutation ghi khi chưa có idempotency key.
- Không tải toàn bộ dữ liệu hệ thống ngay sau đăng nhập.
- Không thêm animation toàn trang để tạo cảm giác mượt; ưu tiên giảm thời gian thực.

## 4. Chỉ tiêu hiệu năng hợp nhất

Đo trên production build (`next build && next start`), ít nhất 10 mẫu warm mỗi luồng, tối thiểu 2 cấu hình mạng (LAN, Fast 3G/độ trễ 100–150ms).

| Chỉ số | Mục tiêu |
|---|---:|
| LCP trang đăng nhập/dashboard, p75 | ≤ 2,5s |
| INP, p75 | ≤ 200ms |
| CLS | ≤ 0,1 |
| Phản hồi trực quan sau click | < 100ms |
| Request chính bắt đầu sau đổi trang/filter (không phải search) | < 50ms |
| API danh sách trang đầu, p50 / p95 | < 200ms / < 500ms |
| API tìm kiếm, p95 (20 request đồng thời) | < 700–800ms |
| API tạo/sửa không upload, p95 | < 500ms |
| Mở route đã prefetch đến nội dung chính, p95 | < 200ms |
| Quay lại list có cache đến nội dung, p95 | < 100ms |
| Tỷ lệ lỗi không do validation | < 0,5% |
| Bản ghi trùng do retry/mạng chập chờn | 0 |
| Dữ liệu tài khoản cũ sau logout | 0 |
| Skeleton toàn bảng khi đã có cache hợp lệ | 0 |

TTL cache đề xuất (điều chỉnh theo số đo thật):

| Loại dữ liệu | Fresh | Có thể stale | Ghi chú |
|---|---:|---:|---|
| Danh sách dự án/công việc/task | 15s | 2 phút | Revalidate nền khi quay lại |
| Danh bạ nhân sự | 5 phút | 15 phút | Invalidate sau sửa tài khoản/phòng ban |
| Chi tiết bản ghi | 15s | 2 phút | Invalidate sau mutation liên quan |
| Báo cáo tiến độ | 5s | 30s | Cần cập nhật nhanh |
| Phê duyệt/tài chính | 0–5s | Rất ngắn/không | Ưu tiên tính mới |

---

## 5. Trình tự triển khai hợp nhất

### Giai đoạn 0 — Baseline & instrumentation (P0, 1–2 ngày, rủi ro thấp)

*Nguồn: Diagnosis GĐ0–2, Instant-Nav GĐ0, Cross-Project GĐ0*

- [ ] Chạy `next build` + `next start`, đo 5 luồng chuẩn: dashboard, danh sách dự án/công việc/task, trang chi tiết — với tài khoản `admin`, `manager`, `member`.
- [ ] Ghi `click → request start`, TTFB, `response end → paint`, tổng thời gian; dùng HAR + Chrome DevTools Performance.
- [ ] Ghi số API, payload, request trùng/lặp cho từng trang.
- [x] Sinh `x-request-id` mỗi response API (qua `apiSuccess`/`apiError` dùng chung trong `src/lib/api/response.ts`). *(Chưa làm `Server-Timing auth/db/map/total` — cần đo sâu hơn từng route, để lại cho vòng sau.)*
- [ ] Log JSON có cấu trúc: route, method, status, duration, số dòng, kích thước response, request id — không log token/PII.
- [ ] Dùng lại bộ dữ liệu lớn đã có trong `PERF-LARGE-DATA-LOAD-TEST-README.md` (200 dự án, 20.000 công việc, 40.000 task).
- [ ] Chốt trạng thái nào được phép hiển thị stale và trong bao lâu (theo bảng TTL mục 4).

**Điều kiện hoàn thành:** có bảng baseline p50/p95/payload/bundle theo từng luồng và vai trò; xác định 3 route chậm nhất và 3 mutation chậm nhất theo quy tắc phân loại nguyên nhân (mục 6 của Diagnosis: backend nếu `request start → response end` > 60% tổng thời gian và vượt ngân sách; frontend nếu request bắt đầu muộn >300ms hoặc có request toàn bộ dữ liệu dư thừa).

**Trạng thái thực tế:** chỉ hoàn thành phần code hóa được (x-request-id). Phần đo HAR/DevTools/Web Vitals thật trên dữ liệu lớn **chưa chạy** — cần người dùng tự đo bằng trình duyệt trước khi coi GĐ0 là xong.

---

### Giai đoạn 1 — Bỏ delay cố định & chống race condition (P0, 1–2 ngày, rủi ro thấp)

*Nguồn: Instant-Nav GĐ1 + Cross-Project GĐ1 (cùng một việc, gộp làm một)*

**File chính:**
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/page.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-cong-viec/page.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-task/page.tsx`
- `src/services/api-client.ts`, `project-service.ts`, `task-service.ts`, `subtask-service.ts`
- `src/components/accounts/AccountManagementPage.tsx`, `DepartmentManagementPage.tsx`, `FinanceManagementPage.tsx` (đã có `AbortController` — dùng làm mẫu)

**Công việc:**
- [x] Tách `searchInput` khỏi `search` (giá trị đã áp dụng); debounce 300ms chỉ cho việc commit `searchInput → search`, không còn gate việc gọi API.
- [x] Đổi trang, page size, filter chọn sẵn (và `search` sau khi debounce commit) gọi API ngay trong effect, không qua timer 300ms trên đường gọi API.
- [x] Chuẩn hóa `getProjectsPage`/`getTasksPage`/`getSubtasksPage` nhận `options?: { signal?: AbortSignal }`, forward xuống `apiClient.get`; effect tải danh sách tạo `AbortController` mới, `return () => controller.abort()`; bỏ qua lỗi khi `AbortError`/`signal.aborted`, không toast.
- [x] Thêm request sequence/version id làm lớp bảo vệ thứ hai trong `SessionDataCache`: version theo key + epoch toàn cache chặn response resolve muộn ghi cache sau abort/invalidate/logout.
- [x] Controller trong effect tải danh sách chính độc lập với các load phụ trợ (danh bạ dự án/công việc phụ thuộc dropdown) — các load phụ trợ đó không đổi trong đợt này.
- [x] Không xóa dữ liệu đang hiện trước khi có response mới (giữ nguyên state cũ cho tới khi request mới thành công/lỗi).

**File đã sửa:**
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/page.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-cong-viec/page.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-task/page.tsx`
- `src/services/project-service.ts`, `src/services/task-service.ts`, `src/services/subtask-service.ts`

**Kiểm thử:** gõ 10 ký tự liên tục chỉ 1–2 request hoàn tất; đổi filter A→B→A khi mạng chậm, UI cuối cùng đúng A; đổi trang không nhấp nháy sai dữ liệu; không cập nhật state sau unmount.
*(Đã chạy `pnpm lint`, `tsc --noEmit`, `pnpm build` — đều pass. Chưa tự kiểm thử tay trên trình duyệt với mạng chậm/nhiều request đồng thời — cần người dùng xác nhận trước khi coi GĐ1 là "xong" theo đúng checklist mục 8.)*

**Điều kiện hoàn thành:** request chính bắt đầu <50ms sau event; số request tìm kiếm giảm ≥60% khi gõ nhanh; không còn race condition quan sát được ở 3 danh sách chính. *(Cần đo lại bằng DevTools để xác nhận số liệu — xem GĐ0.)*

---

### Giai đoạn 2 — Index tìm kiếm & phân trang (P0, 1–2 ngày, rủi ro trung bình)

*Nguồn: Cross-Project GĐ6 (phần index), xác nhận bởi Diagnosis GĐ3*

- [x] Chạy `EXPLAIN (ANALYZE, BUFFERS)` trên database đã liên kết (`supabase db query --linked`) cho query tìm kiếm hiện tại — xác nhận `Seq Scan` trên `cong_viec` (đúng như Diagnosis dự đoán).
- [x] Tạo migration `supabase/migrations/20260802000100_search_and_pagination_indexes.sql` — đã xác minh trước tên bảng/cột thật (`cong_viec.ten_cv`, `task.ten_task`, cả hai đều có `created_at`) khớp 100% với bản nháp trong tài liệu này, không cần chỉnh sửa:

```sql
create extension if not exists pg_trgm;

create index if not exists cong_viec_ten_cv_trgm_idx
  on public.cong_viec using gin (ten_cv gin_trgm_ops);

create index if not exists task_ten_task_trgm_idx
  on public.task using gin (ten_task gin_trgm_ops);

create index if not exists cong_viec_created_at_id_idx
  on public.cong_viec (created_at desc, id desc);

create index if not exists task_created_at_id_idx
  on public.task (created_at desc, id desc);
```

- [x] Kiểm tra tên bảng/cột thực tế (qua `pg_indexes`/`pg_stat_user_tables`) và dung lượng bảng trước khi chạy: `cong_viec` 18 dòng, `task` 24 dòng, `du_an` 4 dòng — dữ liệu môi trường dev/test hiện tại, không phải quy mô production nêu trong bảng chỉ tiêu (200 dự án/20.000 công việc/40.000 task); do đó **không cần lập lịch bảo trì**, migration áp dụng tức thì. Đã push lên database đang liên kết bằng `supabase db push --linked` (có xác nhận của người dùng trước khi chạy).
- [x] Đo lại `EXPLAIN` sau index: index đã tồn tại và **được planner dùng khi ép `set enable_seqscan = off`** (`Bitmap Index Scan` trên `cong_viec_ten_cv_trgm_idx`/`task_ten_task_trgm_idx`, `Index Scan` trên `cong_viec_created_at_id_idx`) — xác nhận index hợp lệ và hoạt động đúng cơ chế. Ở quy mô dữ liệu dev hiện tại (dưới 25 dòng/bảng), planner mặc định vẫn chọn `Seq Scan` vì rẻ hơn — đây là hành vi đúng của cost-based optimizer, không phải index bị bỏ qua; scan type sẽ tự chuyển sang dùng index khi số dòng tăng lên đáng kể.

**Điều kiện hoàn thành:** index được dùng cho từ khóa có tính chọn lọc — **đã xác nhận qua ép buộc scan**; median tìm kiếm và trang sâu giảm rõ so với baseline giai đoạn 0 — **chưa đo được** vì GĐ0 chưa có baseline p50/p95 thật (xem GĐ0) và dữ liệu hiện tại quá nhỏ để so sánh có ý nghĩa. Cần đo lại khi có bộ dữ liệu lớn theo `PERF-LARGE-DATA-LOAD-TEST-README.md`.

---

### Giai đoạn 3 — Timeout & retry có kiểm soát (P0, 2–4 ngày, rủi ro trung bình)

*Nguồn: Cross-Project GĐ2*

- [x] Thêm timeout mặc định vào `apiClient` (`src/services/api-client.ts`): GET/HEAD (danh sách) 15s, mutation JSON (POST/PUT/PATCH/DELETE) 20s, upload (`postFormData`, phát hiện qua `body instanceof FormData`) 30s; có thể ghi đè qua `options.timeoutMs`.
- [x] Kết hợp signal của caller và signal timeout qua `combineSignals()`; khi cả hai cùng abort, code phân biệt nguồn gốc (`callerSignal?.aborted`) để caller abort giữ nguyên `AbortError` gốc (nơi gọi tự bỏ qua như cũ), còn timeout ném `ApiError` riêng biệt (kind `"timeout"`) — không bị nhầm là bị hủy nên UI vẫn báo lỗi.
- [x] GET/HEAD retry tối đa 2 lần (tổng tối đa 3 lần gọi), backoff 300ms rồi 800ms + jitter ngẫu nhiên tới 100ms; đọc header `Retry-After` (dạng số giây hoặc HTTP-date) để ưu tiên hơn backoff mặc định khi server có trả về.
- [x] Không retry khi: caller đã abort (`callerSignal.aborted`), đã hết lượt retry, hoặc `document.visibilityState === "hidden"` (proxy thực tế cho "tab đã ẩn/đóng" — trình duyệt không cho JS biết chính xác lúc tab bị đóng hẳn, nhưng `visibilitychange` là tín hiệu gần nhất và được khuyến nghị dùng cho trường hợp này).
- [x] Chuẩn hóa lỗi thành `ApiError` có field `kind: "timeout" | "network" | "auth" | "validation" | "server" | "unknown"` — phân loại theo status: 401/403 → `auth`, 408 → `timeout`, 5xx → `server`, còn lại 4xx → `validation`; lỗi mạng (fetch reject không phải AbortError) → `network`. UI hiện tại dùng `getErrorMessage()` đọc `error.message` nên không cần sửa gì thêm để tương thích ngược; `kind` sẵn sàng cho UI nào muốn hiển thị khác nhau theo nhóm lỗi sau này.
- [ ] Ghi request id vào log server/client để truy vết xuyên suốt — **chưa làm phần client log**; phần server (`x-request-id` header) đã có từ GĐ0.

**Không retry cho mutation:** đúng theo nguyên tắc bắt buộc của kế hoạch ("POST/PUT/PATCH/DELETE chỉ retry khi có idempotency key") — GĐ9 (idempotency) chưa triển khai nên `canRetry` chỉ bật cho GET/HEAD.

**File thay đổi:** chỉ `src/services/api-client.ts` — không cần sửa các service (`project-service.ts`/`task-service.ts`/...) hay trang danh sách vì chúng gọi qua `apiClient` sẵn, timeout/retry áp dụng trong suốt.

**Kiểm thử:** mô phỏng 503 rồi thành công (GET tự hồi phục); mô phỏng timeout (UI thoát loading, cho phép thử lại); POST bị ngắt sau khi server đã ghi (chưa tự gửi lại ở giai đoạn này); upload timeout không khóa vĩnh viễn modal. *(Đã chạy `pnpm lint`, `tsc --noEmit`, `pnpm build` — pass. Chưa tự kiểm thử tay các kịch bản trên bằng DevTools throttling/mock — cần người dùng xác nhận.)*

---

### Giai đoạn 4 — Cache phiên & prefetch theo ý định (P0, 4–7 ngày, rủi ro trung bình)

*Nguồn: Instant-Nav GĐ2 + GĐ3 (gộp vì phụ thuộc lẫn nhau)*

**File mới:**
```
src/lib/client-cache/session-data-cache.ts
src/hooks/useSessionQuery.ts
src/hooks/usePrefetchSessionQuery.ts
src/components/providers/SessionDataCacheProvider.tsx
src/components/navigation/IntentPrefetchLink.tsx
```

**Cache phiên — công việc:**
- [x] `get/fetch/prefetch/set/invalidate/clear` theo API tối thiểu mô tả ở mục 3 (`session-data-cache.ts`); dedupe promise đang chạy theo key (`pending` Map); mỗi `fetch()` có `AbortController` riêng, `invalidate()`/`clear()` abort các request đang chạy dở khớp key; giới hạn LRU cứng 200 entry (`evictOverflow`); `prefetch()` giới hạn 3 request đồng thời + hàng đợi tối đa 20.
- [x] `SessionDataCacheProvider` đặt trong `src/app/(dashboard)/layout.tsx` (bên trong `CurrentAccountProvider`, bọc `FeedbackProvider`); cache danh sách theo `buildCacheKey({accountId, role, resource, filters, page, pageSize})`; directory (thành viên/dự án/công việc dùng cho dropdown) dùng resource riêng (`directory-members`/`directory-projects`/`directory-tasks`, không có page/pageSize) — chia sẻ được giữa 3 trang danh sách vì cùng account/role thì cùng key.
- [x] Xóa cache trong `onAuthStateChange` khi `SIGNED_OUT` hoặc `SIGNED_IN` (đổi tài khoản trên cùng tab) — đặt ngay trong `SessionDataCacheProvider`, không phụ thuộc từng trang tự gọi.
- [x] Sau mutation (tạo/sửa/xóa dự án/công việc/task): gọi `setData()` cập nhật đúng key hiện tại **trước**, rồi mới `cache.invalidate(resource, exceptKey)` xóa các trang/bộ lọc cache khác của resource đó (trừ key vừa ghi) — tránh khoảng trống dữ liệu giữa 2 bước; revalidate nền lỗi thì `useSessionQuery` giữ nguyên dữ liệu cũ trong cache, chỉ set `error` để UI báo nhỏ.
- [x] Không chuyển sang TanStack Query — cache tự xây trong phạm vi 3 trang danh sách vẫn đủ, không có nhu cầu vượt phạm vi (không cần persistence/infinite query/retry phức tạp hơn GĐ3 đã có).

**Prefetch theo ý định — công việc:**
- [x] `IntentPrefetchLink` (`src/components/navigation/IntentPrefetchLink.tsx`) bọc `next/link`; `onPointerEnter/onFocus/onTouchStart` gọi `router.prefetch(href)` một lần duy nhất mỗi lần mount (chặn bằng `firedRef`); tham số `onIntent` để prefetch dữ liệu client qua `usePrefetchSessionQuery` — **có hook nhưng chưa có nơi nào truyền `onIntent`** (xem mục "Chưa làm" trong README).
- [x] Không prefetch khi mount — chỉ kích hoạt theo tương tác thật; giới hạn đồng thời 3 + hàng đợi 20 nằm trong `SessionDataCache.prefetch()`, dùng chung cho mọi nơi gọi.
- [x] Áp dụng cho tên dự án/công việc/task ở **bảng** (`ProjectTable`/`TaskTable`/`SubtaskTable`) — đổi từ `<button onClick={router.push}>` sang `<IntentPrefetchLink href=...>`. **Chưa áp dụng cho Card** (`ProjectCard`/`TaskCard`/`SubtaskCard`) và **thông báo/Sidebar** — xem giới hạn ở README mục 8.4.
- [x] Thay nút `router.push()` bằng `Link` cho đúng 3 chỗ trên (tên bản ghi ở bảng) — các nút hành động khác (icon Sửa/Xóa/Xem chi tiết dạng icon) giữ nguyên `router.push()` vì không phải điều hướng ngữ nghĩa chính và đổi sang `<a>` cho icon-only button không có lợi ích rõ ràng.
- [ ] Kiểm tra keyboard navigation, screen reader, middle-click/open-new-tab — **chưa tự kiểm thử**, cần người dùng xác nhận bằng trình duyệt thật.

**Quy tắc render stale-while-revalidate:** cache miss → loading; fresh → hiện ngay; stale nhưng dùng được → hiện ngay + revalidate nền (`useSessionQuery` giữ `data` trong lúc `isRevalidating`); revalidate fail → giữ dữ liệu cũ (`error` không xóa `data`) — **UI chưa có cảnh báo nhỏ + nút thử lại riêng cho revalidate-nền-lỗi**, hiện chỉ có toast lỗi qua `notify()` giống lỗi tải lần đầu (xem giới hạn); đổi filter/page có cache → hiện ngay (không chờ debounce vì đã tách khỏi GĐ1); mutation → cập nhật local (`setData`) trước, chưa có rollback tự động nếu server lỗi ở bước sau `await` (giữ nguyên hành vi cũ trước GĐ4: lỗi thì toast, không patch state).

**Điều kiện hoàn thành:** quay lại trang đã mở hiện cache ngay trong TTL fresh (15s cho danh sách, 5 phút cho directory) — **đạt**; cùng request key chỉ 1 network request chạy — **đạt** (dedupe trong `SessionDataCache.fetch`); hover/focus rồi bấm mở chi tiết không chờ khi đã prefetch xong — **đạt cho route RSC prefetch** (`router.prefetch`), trang chi tiết tự fetch dữ liệu riêng nên chưa "tức thời" hoàn toàn (xem giới hạn); logout/đổi tài khoản không còn thấy cache cũ — **đạt** (`SessionDataCacheProvider` clear qua `onAuthStateChange`). *(Chưa tự đo bằng trình duyệt thật — cần người dùng xác nhận.)*

---

### Giai đoạn 5 — Server initial data & thu nhỏ payload (P1, 6–10 ngày, rủi ro trung bình)

*Nguồn: Instant-Nav GĐ4 + GĐ5, Cross-Project GĐ6 (cursor, tùy chọn) + GĐ7*

**Server initial data:**
- [x] Tách `page.tsx` (Server Component tải trang đầu + quyền) khỏi `*ListClient.tsx` (Client Component nhận `initialData`) — làm cả 3: `danh-sach-du-an` (`ProjectListClient.tsx`), `danh-sach-cong-viec` (`TaskListClient.tsx`), `danh-sach-task` (`SubtaskListClient.tsx`). Dùng lại đúng pattern đã có sẵn ở 3 trang chi tiết (`[id]/page.tsx` + `*DetailView.tsx`) — không phải phát minh cơ chế mới.
- [x] Không gọi API nội bộ `/api/*` từ Server Component — gọi thẳng các hàm data-access trong `src/lib/supabase/data.ts` (`listProjectsPage`, `listWorkTasksPage`, `listSubtasksPage`, `listDirectory`, `listProjects`, `listWorkTasks`) với `createServerSupabaseClient()` (đã có sẵn, dùng cookie) + `requireRequestAccount()` (đã có sẵn, đúng cơ chế 3 trang chi tiết đang dùng).
- [x] Client seed cache bằng initial data qua `useSessionQuery({ initialData })` mới — dùng `useState(() => {...})` (lazy initializer, chạy đúng một lần kể cả trong SSR pass của Client Component) để ghi thẳng vào `SessionDataCache` trước khi có render đầu tiên, không gọi fetcher, không hiện skeleton. `[ ]` **URL hóa page/pageSize/filter — chưa làm** (mục "nếu cần" trong kế hoạch; state vẫn reset về mặc định mỗi lần vào trang, back/forward trình duyệt không giữ được filter/trang đang xem — xem giới hạn ở README).

**Thu nhỏ dữ liệu phụ:** — **xong về mặt code 02/08/2026**:
- [x] Tạo chế độ directory tối giản cho dự án/công việc và giữ `/api/users` là directory nhân sự tối giản.
- [x] Không tải toàn bộ payload công việc chỉ để chọn quan hệ phụ thuộc.
- [x] Xuất PDF tài khoản đọc payload list tối giản theo từng trang, không tải toàn bộ hồ sơ detail.
- [x] Tách trường API account list/detail; trường ngân hàng/địa chỉ/ngày sinh/ghi chú không còn trong list.
- [x] Đặt payload budget và cảnh báo JSON phía client theo nhóm route.

**Mở rộng server-side pagination:**
- [x] Phân trang server cho tài khoản/nhân viên; filter/sort/search/count chạy server-side, page size tối đa 100.
- [ ] Cursor pagination — đúng theo điều kiện "chỉ làm nếu sau index (GĐ2) vẫn đo thấy trang sâu chậm", mà GĐ2 chưa đo được trên dữ liệu lớn (xem GĐ2), nên chưa có căn cứ để làm bước này.
- [x] `count: "exact"` — đã dùng cho tài khoản và đã xác nhận ba hàm `list*Page` hiện hữu cũng dùng exact count.

**Điều kiện hoàn thành:** HTML/RSC đầu có dữ liệu trang đầu hoặc shell hợp lệ — **đạt**, xác nhận qua `pnpm build`: cả 3 route đổi từ `○` (Static) sang `ƒ` (Dynamic, server-rendered mỗi request); không còn waterfall `hydrate → getSession → API` — **đạt cho 3 trang danh sách chính**. Payload trang đầu không tăng tuyến tính theo tổng dữ liệu — **đạt** nhờ phân trang server-side; phần còn lại GĐ5 đã hoàn tất sau bản ghi lịch sử ban đầu: endpoint directory tối giản, list/detail account tách field, account pagination phía server và payload budget đã có (xem `PERF-PHASE-0-1-README.md` mục 10–11). Directory không trả trường tài chính/địa chỉ/ghi chú nhạy cảm không cần cho dropdown.

---

### Giai đoạn 6 — Mutation, invalidation & độ tin cậy (P1, 2–4 ngày, rủi ro thấp) — [x] xong về mặt code, bổ sung 02/08/2026

*Nguồn: Instant-Nav GĐ7*

- [x] Lập ma trận mutation → cache key cần update/invalidate (bảng dưới) — dựa trên khảo sát thật (subagent đọc code), không suy đoán.
- [x] Update đồng bộ list/detail/panel dự án/công việc liên quan (đã có từ GĐ4/GĐ5) + bổ sung invalidate cache dùng chung (`SessionDataCache`) ở các nơi trước đây hoàn toàn đứng ngoài cache: 3 trang chi tiết (`*DetailView.tsx`), 2 panel lồng (`ProjectTasksPanel`, `WorkTaskSubtasksPanel`), và `AccountManagementPage.tsx`. Delete vẫn loại bản ghi khỏi state cục bộ đúng như trước (GĐ4); "giảm total" trong cache dựa vào việc `invalidate()` xóa toàn bộ entry của resource, trang nào đọc lại sẽ tự fetch total mới — không cộng/trừ số thủ công trong cache (tránh sai lệch nếu 2 tab cùng sửa).
- [x] Rollback optimistic: xác nhận lại cơ chế đã có từ GĐ4 (không thêm mới) — 2 trang có `useOptimistic` (dự án, công việc) tự rollback khi promise reject (hành vi chuẩn của `useOptimistic`/`startTransition`, không cần code tay); các nơi còn lại (task con, 3 trang chi tiết, panel lồng, tài khoản) đều đợi API trả về thành công rồi mới `setState`, nên không có state lạc quan nào cần rollback. Dashboard đã được bổ sung resource `dashboard`, seed từ Server Component bằng khóa `accountId + role`, và khai báo dependency để mọi invalidate `projects-list`/`tasks-list`/`subtasks-list`/`directory-members` tự invalidate dashboard.

| Mutation | Cập nhật ngay | Invalidate nền |
|---|---|---|
| Tạo/sửa/xóa dự án | list + detail dự án (đã có GĐ4/GĐ5) | `directory-projects` (đã có GĐ4); **mới:** trang chi tiết dự án sau khi sửa cũng tự `invalidate("projects-list")` + `invalidate("directory-projects")` (trước đây hoàn toàn không đụng cache) |
| Tạo/sửa/xóa công việc | list + detail + panel dự án (đã có GĐ4/GĐ5) | `directory-tasks`, `projects-list` (project.stats.done/total đổi theo trạng thái công việc); **mới:** trang chi tiết công việc (sửa + đổi nhanh ưu tiên/người phụ trách) và `ProjectTasksPanel` (tạo/sửa/xóa công việc trong tab "Công việc" của trang dự án) đều tự invalidate — trước đây 2 nơi này không invalidate gì |
| Tạo/sửa/xóa task | list + panel công việc (đã có GĐ4); **mới:** trang chi tiết task + `WorkTaskSubtasksPanel` (tab "Task" trong trang chi tiết công việc) | `tasks-list` (tiến độ công việc cha tính theo trung bình task con) — **mới ở cả 2 nơi**, trước đây hoàn toàn không invalidate resource nào |
| Báo cáo/duyệt task | `subtasks-list` (đã có ở `SubtaskListClient`, thiếu ở panel lồng — đã bổ sung) | **mới:** `tasks-list` (công việc cha) ở cả `SubtaskListClient` (duyệt/sửa/báo cáo) lẫn `WorkTaskSubtasksPanel`/`SubtaskDetailView` (duyệt/xác nhận/báo cáo) — trước đây chỉ invalidate đúng `subtasks-list`, không lan sang công việc cha. Notification giữ cơ chế riêng (`window.dispatchEvent("app:notifications-changed")`). Dashboard hiện là dependent cache nên tự bị invalidate khi `subtasks-list`/`tasks-list` đổi. |
| Sửa tài khoản/phòng ban | — | `directory-members` — **mới**, `AccountManagementPage.tsx` (thêm/sửa/xóa/khóa-mở khóa/khóa-mở hàng loạt/nhập CSV) trước đây hoàn toàn độc lập với `SessionDataCache`. **Không thêm cho `DepartmentManagementPage.tsx`**: đã đọc `ACCOUNT_SELECT` (`src/lib/supabase/data.ts:198`) xác nhận `directory-members` chỉ gồm `id/ma_nv/ten_nv/chuc_vu/email/avatar_url` của tài khoản — không có tên phòng ban — nên sửa phòng ban không làm dữ liệu directory sai lệch, invalidate ở đây sẽ vô nghĩa (chỉ gây fetch thừa) |

**Điều kiện hoàn thành:** không hiển thị dữ liệu cũ kéo dài sau mutation ở các nơi vừa nối cache — **đạt về mặt code** (đã build pass, chưa tự kiểm thử tay bằng trình duyệt thật, xem README); không bật skeleton toàn trang để đồng bộ một bản ghi — **đạt**, `invalidate()` không xóa state cục bộ đang hiển thị, chỉ buộc lần đọc kế tiếp fetch lại (stale-while-revalidate như GĐ4); rollback đúng khi API lỗi — **đạt cho phần có `useOptimistic`** (không đổi gì, hành vi React chuẩn), **không áp dụng** cho phần còn lại (không có optimistic update nên không có gì để rollback — đây là hành vi an toàn có chủ đích, không phải thiếu sót).

---

### Giai đoạn 7 — Lưu bản nháp form an toàn (P1, 2–3 ngày, rủi ro trung bình do dữ liệu nhạy cảm) — [x] xong về mặt code, bổ sung 02/08/2026

*Nguồn: Cross-Project GĐ3*

- [x] Tạo `useVersionedFormDraft` (`src/hooks/useVersionedFormDraft.ts`): key gồm `accountId` + loại form + create/edit + entity id (`buildFormDraftKey`); payload có `schemaVersion`, `savedAt`, `expiresAt`, thêm `entityVersion` (không có trong yêu cầu gốc, bổ sung để làm được mục "cảnh báo xung đột" bên dưới); debounce ghi 800ms (trong khoảng 500–1000ms yêu cầu).
- [x] Mặc định `sessionStorage`; `localStorage` chỉ dùng khi bật checkbox "Ghi nhớ bản nháp trên thiết bị này" (`RememberDraftToggle`, tham số `persistent`) — riêng `FinanceTransactionModal` truyền `allowPersistent: false` nên không hiện checkbox này, luôn `sessionStorage`, đúng yêu cầu kế hoạch.
- [x] Không lưu: đã rà từng form — không có trường mật khẩu/token/lương/số tài khoản ngân hàng nào trong 4 form áp dụng. **Cố tình loại hẳn `files`/`links`/`images` (và trường tương đương ở giao dịch tài chính: `receiptImages`/`receiptFiles`/`receiptLinks`) khỏi payload draft** — an toàn hơn yêu cầu gốc (chỉ cấm base64/URL tạm chưa xác nhận): đơn giản hóa có chủ đích, tránh phải phân biệt "URL đã lưu" vs "upload tạm chưa xác nhận" cho từng loại đính kèm.
- [x] Khi mở form có draft: `FormDraftBanner` (`src/components/ui/FormDraftBanner.tsx`) hiện thời điểm lưu (giờ:phút ngày/tháng), nút Khôi phục/Bỏ; **không tự áp draft** — form vẫn hiển thị dữ liệu gốc từ props cho tới khi bấm "Khôi phục". Cảnh báo xung đột: so `entityVersion` lưu trong draft (chụp từ `task.updatedAt`/`subtask.updatedAt` lúc lưu) với giá trị hiện tại của bản ghi đang mở — **chỉ làm được cho công việc và task con** (2 type có trường `updatedAt`); dự án và giao dịch tài chính không có `updatedAt` trong kiểu dữ liệu hiện tại nên không phát hiện xung đột được, chỉ hiện banner khôi phục bình thường (xem giới hạn ở README).
- [x] Xóa draft sau save thành công (`clearDraft()` ngay sau `notify` thành công, trước `onClose()`, ở cả 4 modal) — khi bấm "Bỏ" ở banner — khi hết TTL (`expiresAt`, mặc định 24h, đọc draft mà thấy hết hạn thì tự xóa) — khi logout/đổi tài khoản (`clearAllFormDrafts()` gọi trong `SessionDataCacheProvider`, cùng chỗ đã `cache.clear()` từ GĐ4).
- [x] Áp dụng đúng thứ tự: `ProjectFormModal` → `TaskFormModal` → `SubtaskFormModal` → `FinanceTransactionModal` (chỉ sessionStorage, không có checkbox "ghi nhớ trên thiết bị"). Không áp dụng cho form tài khoản/hồ sơ nhân sự (`AccountFormModal`) — đúng loại trừ "không áp dụng cho mật khẩu/hồ sơ nhân sự nhạy cảm" của kế hoạch.

**Điều kiện hoàn thành:** reload giữa lúc nhập khôi phục được dữ liệu text/select/date — **đạt về code** (đã build pass; chưa tự bấm F5 kiểm thử tay trên trình duyệt thật, xem README); save thành công không để lại draft cũ — **đạt**, `clearDraft()` gọi ngay sau mỗi luồng lưu thành công ở cả 4 modal; đổi tài khoản trên cùng máy không thấy draft tài khoản trước — **đạt gấp đôi**: key đã khóa theo `accountId` (khác tài khoản = khác key, không đọc được draft cũ dù không xóa) **và** `clearAllFormDrafts()` chủ động xóa hẳn khi logout/đổi tài khoản.

---

### Giai đoạn 8 — Batch API & kiểm soát đồng thời upload (P1, 3–5 ngày, rủi ro trung bình) — [x] xong về mặt code, bổ sung 02/08/2026

*Nguồn: Cross-Project GĐ5*

- [x] `POST/PATCH /api/accounts/batch` giới hạn 100 phần tử/lần; route parse/validate toàn bộ input trước mutation. Khóa/mở nhiều tài khoản dùng đúng 1 request; nhập CSV dùng một batch insert thay vì N POST tuần tự.
- [x] Bulk status dùng `.update({ status }).in("id", ids)` sau bước xác nhận toàn bộ id còn tồn tại; batch CSV dùng một lệnh insert mảng. UI xác nhận số response khớp số target.
- [x] `runUploadBatch()` dùng một hàng đợi chung tối đa 4 upload cho form dự án/công việc/task/giao dịch. File thành công được chuyển ngay từ pending sang URL đã lưu; file lỗi ở lại pending nên lần bấm Lưu kế tiếp chỉ retry đúng file lỗi, không upload lại file đã xong.
- [x] Entity chính chỉ được tạo/cập nhật sau khi upload hoàn tất. Route báo cáo task cũng giới hạn 4 upload, giới hạn 10 ảnh + 10 tệp phía server và cleanup các path đã upload nếu một file khác hoặc bước lưu báo cáo thất bại.

**Điều kiện hoàn thành:** cập nhật 50 tài khoản không tạo 50 request — **đạt về code** (1 PATCH batch); upload 10 file không vượt concurrency — **đạt**, test runtime xác nhận `maxConcurrent = 4`; 1 file lỗi không mất trạng thái các file đã xong — **đạt về code**, test runtime xác nhận kết quả 8 thành công/1 lỗi được tách riêng. Còn cần smoke test UI/API bằng phiên đăng nhập thật.

---

### Giai đoạn 9 — Idempotency & mutation nguyên tử (P1, 5–8 ngày, rủi ro cao) — [x] phần idempotency xong về mặt code, [ ] phần RPC transaction chưa làm, bổ sung 02/08/2026

*Nguồn: Cross-Project GĐ4*

- [x] Thêm bảng `mutation_requests` (`supabase/migrations/20260802000200_mutation_requests_idempotency.sql`, đã `supabase db push --linked` thành công, xác nhận qua `pg_constraint`) cho 3 thao tác tạo quan trọng nhất (dự án/công việc/task — cả 3 đều ghi ≥2 bảng nên có nguy cơ trùng/kẹt nửa chừng thật, xác nhận qua khảo sát code trước khi làm, không suy đoán); client gửi UUID một lần qua header `Idempotency-Key` (`src/hooks` không cần đổi — sinh trực tiếp trong 3 `*FormModal.tsx` bằng `useState(() => mode === "create" ? crypto.randomUUID() : undefined)`, ổn định suốt phiên mở form kể cả khi submit lại sau lỗi).
- [x] Server (`src/lib/supabase/idempotency.ts`, hàm `withIdempotency`) đảm bảo cùng `account_id` + cùng `idempotency_key` + cùng `scope` chỉ thực thi một lần: `insert` giữ chỗ trước, unique constraint `(account_id, idempotency_key, scope)` là nơi duy nhất chặn race condition (không dùng SELECT-rồi-INSERT); request thua đọc lại `status`/`response_body` đã lưu nếu đã `completed`, hoặc nhận lỗi `409` nếu bản giữ chỗ vẫn `processing` (request khác đang chạy, hoặc lần trước crash giữa chừng).
- [ ] **Chưa làm:** "sau khi idempotency được kiểm thử, mới cho phép retry POST tạo dữ liệu" — đúng theo đúng câu chữ của kế hoạch, việc bật retry POST ở `api-client.ts` **cố tình để lại cho vòng sau**, sau khi có xác nhận kiểm thử tay thật (xem mục 9 của README `PERF-PHASE-6-README.md`). Hiện `api-client.ts` vẫn giữ nguyên từ GĐ3: chỉ GET/HEAD tự retry, mutation không bao giờ tự retry.
- [ ] **Chưa làm:** chuyển mutation nhiều bước sang RPC transaction thật (PL/pgSQL). Lý do dừng ở compensating-delete (xem dòng dưới) thay vì viết RPC ngay trong đợt này: mỗi hàm tạo (`createProject`/`createWorkTask`/`createSubtask`) hiện có logic validate/phân quyền/resolve người dùng trải trên nhiều hàm phụ trợ TypeScript (`resolveAccounts`, `assertProjectParticipants`, `assertWorkTaskAssignees`, `assertWorkTaskScheduleWithinProject`,...) — viết lại đúng 100% các quy tắc này bằng PL/pgSQL mà không có môi trường kiểm thử tương tác thật là rủi ro cao hơn lợi ích đo được ở quy mô dữ liệu hiện tại (xem GĐ2: dữ liệu dev chỉ vài chục dòng), đúng tinh thần rủi ro "cao" mà kế hoạch tự xếp hạng cho giai đoạn này.
- [x] **Đã làm thay** (giảm rủi ro tạm thời, không phải RPC): thêm `try/catch` + xóa bù (compensating delete) ở `createWorkTask`/`createSubtask` (`src/lib/supabase/data.ts`) khi bước gán người phụ trách (`syncAssignments`) lỗi sau khi đã tạo bản ghi chính — mirror đúng mẫu `createProject()` đã có sẵn từ trước (bất đối xứng phát hiện được khi khảo sát: `createProject` có rollback, `createWorkTask`/`createSubtask` không có). Đây vẫn là 2 round-trip riêng (không phải 1 transaction DB), vẫn còn khe hở race rất nhỏ giữa 2 bước, nhưng thu hẹp đáng kể so với "không rollback gì" trước đó.
- [x] Giao dịch tài chính (`createFinanceTransaction`, `src/lib/supabase/finance.ts`) xác nhận qua đọc code: chỉ `insert` vào 1 bảng `thu_chi`, không có bảng phân bổ nào khác — đúng loại trừ "không chuyển mutation đơn bảng đang nhanh sang RPC nếu không có lợi ích đo được", không thêm idempotency/RPC cho endpoint này.

**File thay đổi:**
- Mới: `supabase/migrations/20260802000200_mutation_requests_idempotency.sql`, `src/lib/supabase/idempotency.ts`.
- Sửa: `src/app/api/projects/route.ts`, `src/app/api/tasks/route.ts`, `src/app/api/subtasks/route.ts` (nối `withIdempotency`); `src/lib/supabase/data.ts` (rollback `createWorkTask`/`createSubtask`); `src/services/project-service.ts`/`task-service.ts`/`subtask-service.ts` (`createX` nhận `options?.idempotencyKey`); `src/components/projects/ProjectFormModal.tsx`/`src/components/tasks/TaskFormModal.tsx`/`src/components/subtasks/SubtaskFormModal.tsx` (sinh + forward key); `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/ProjectListClient.tsx`/`danh-sach-cong-viec/TaskListClient.tsx` (`saveProject`/`saveTask` forward key từ `onSave`).

**Kiểm thử:** 2 POST đồng thời cùng idempotency key → 1 bản ghi — **chưa tự kiểm thử tay** (cần 2 tab/2 request thật, xem README); ngắt kết nối sau DB commit rồi gửi lại → cùng kết quả — **đạt về logic** (đọc lại `response_body` đã lưu khi `status = completed`), chưa tự mô phỏng mất mạng thật; lỗi bảng liên kết → rollback toàn bộ — **đạt một phần** (compensating delete cho công việc/task, không phải rollback DB transaction thật); phân quyền không đổi — **đạt**, không sửa `assertManagerOrAdmin`/`assertWorkTaskAssignees` nào, chỉ thêm `requireRequestAccount` vào `POST /api/subtasks` (trước đây thiếu hẳn bước xác thực, giờ có nhưng không thêm giới hạn vai trò nào mới).

---

### Giai đoạn 10 — Bundle, lazy-load & prefetch budget (P1, 3–5 ngày, rủi ro thấp–trung bình) — [x] audit xong, kết luận: không cần sửa code, bổ sung 02/08/2026

*Nguồn: Cross-Project GĐ8*

- [x] Dùng bundle size để xác định component thật sự nặng — **không dùng lại số liệu GĐ0** vì GĐ0 chưa từng đo được (chưa có baseline thật, xem GĐ0). Thay vào đó khảo sát trực tiếp: đọc `package.json` (chỉ 9 dependency production, không có chart/editor/crop library nào), grep toàn bộ `next/dynamic`, đối chiếu từng modal/drawer với nơi gọi, và đọc trực tiếp `.next/static/chunks/*` + `build-manifest.json` sau `next build` để xem chunk nào nằm trong `rootMainFiles` (tải ngay) so với chunk async (`pdfmake`, `@supabase/supabase-js` — xác nhận KHÔNG nằm trong `rootMainFiles`, chỉ tải khi thực sự cần). Kết luận: không tìm thấy component nặng nào chưa được xử lý — không dynamic-import thêm gì (đúng nguyên tắc "không dynamic-import tràn lan").
- [x] `next/dynamic` cho modal/drawer — đối chiếu toàn bộ 11 file `*Modal.tsx`/`*Drawer.tsx` với mọi nơi `import`/`dynamic()` gọi tới: cả 11 đều được `next/dynamic` hóa ở **mọi** nơi sử dụng, không có nơi nào import tĩnh sót lại. Phát hiện thêm: `TaskQuickViewModal.tsx` hiện **không được import ở bất kỳ đâu trong toàn bộ codebase** — dead code, nhưng vì không được import nên Turbopack không đưa vào bundle nào cả (ảnh hưởng bundle = 0); không xóa vì ngoài phạm vi một đợt sửa hiệu năng, chỉ ghi nhận để bạn quyết định.
- [x] Lazy-load thêm cho biểu đồ dashboard/trình xem ảnh/export/module admin — đọc trực tiếp `PerformanceDashboard.tsx` (không dùng thư viện chart nào, toàn bộ là SVG/CSS tự viết + `lucide-react`) và `ImagePreviewDialog.tsx` (một thẻ `<img>` + nút đóng, không thư viện) — cả hai đều quá nhẹ để tách thêm, tách ra sẽ chỉ thêm 1 network round-trip không cần thiết (đi ngược nguyên tắc "không dynamic-import tràn lan"). Export PDF (`src/lib/pdf-export.ts`) đã dùng `import("pdfmake/build/pdfmake")` động ngay tại hàm `exportTablePdf()` từ trước — xác nhận qua đọc code, không phải giả định — nên đã đúng yêu cầu "không đưa PDF vào shared layout bundle" mà không cần sửa gì. Module admin (`AccountManagementPage`, `DepartmentManagementPage`, trang `/nhan-vien/phan-quyen`...) đã tự động tách JS theo route của Next.js App Router (mỗi `page.tsx` là 1 chunk riêng) — không cần thêm `next/dynamic` để đạt hiệu quả tương đương.
- [x] `ssr: false` — rà lại cả 12 file dùng `next/dynamic`: tất cả đều đặt `ssr: false` (đúng, vì đều là modal/drawer chỉ render khi người dùng mở, dùng browser API như `document.body.style.overflow`/`document.addEventListener`), không nơi nào đặt sai chỗ.
- [x] Đặt bundle budget — **thử dùng `@next/bundle-analyzer` trước, xác nhận KHÔNG tương thích**: đọc `node_modules/next/dist/docs/.../08-turbopack.md` (đúng yêu cầu AGENTS.md "đọc docs trước khi dùng API mới") — mục "Known gaps with webpack" ghi rõ *"Turbopack does not support webpack plugins... `webpack()` configuration in `next.config.js`: Turbopack replaces webpack, so `webpack()` configs are not recognized"* — `@next/bundle-analyzer` là webpack plugin nên không dùng được với `next build` (mặc định Turbopack từ Next 16). Không có công cụ phân tích bundle tương đương chính thức nào cho Turbopack ở phiên bản này (chỉ có `NEXT_TURBOPACK_TRACING=1` cho debug hiệu năng dev, không phải phân tích thành phần bundle). **Không cài `@next/bundle-analyzer`** — tránh thêm dependency chết không hoạt động được. Số liệu thay thế (không thay cho đo thật): kích thước file trên đĩa của `.next/static/chunks/*` sau build — 2 chunk lớn nhất (~1.3MB và ~830KB, chưa gzip) tương ứng `pdfmake` (đã xác nhận là chunk async, không tải khi mở trang thường) và một chunk framework/nội bộ chưa định danh được chính xác nếu không có analyzer thật.
- [x] `memo/useMemo/useCallback` — không thêm gì trong đợt này, đúng điều kiện "chỉ thêm sau khi React Profiler xác nhận" — chưa có phiên đo Profiler nào được chạy.

**Điều kiện hoàn thành:** mở route không tải JS của modal/export chưa dùng — **đạt**, xác nhận qua `build-manifest.json` (`pdfmake`/`@supabase` không nằm trong `rootMainFiles`); không có chunk bất thường — **đạt theo kiểm tra thủ công** (không có chunk lớn bất ngờ nào chứa thư viện không mong đợi), nhưng **chưa đo được bằng công cụ phân tích bundle thật** (không có công cụ tương thích Turbopack ở thời điểm này — xem trên); điều hướng warm đạt chỉ tiêu mà không tăng prefetch thừa — **không đổi gì ở GĐ10** nên không có rủi ro mới, hành vi prefetch vẫn như GĐ4 đã làm.

---

### Giai đoạn 11 — Quan sát, cảnh báo & rollout (P1, liên tục, rủi ro thấp)

*Nguồn: Cross-Project GĐ10, mở rộng từ instrumentation giai đoạn 0*

- [x] Duy trì `x-request-id` + `Server-Timing auth/db/map/total` qua lớp response/API dùng chung; production build và smoke test endpoint đã xác nhận header/log khớp request id.
- [x] Pipeline thu thập Web Vitals theo route đã có (`useReportWebVitals` + `sendBeacon` → `/api/observability/web-vitals`) và đã ghi được mẫu thật. **Chưa đủ dữ liệu production/staging đại diện để kết luận percentile.**
- [ ] Cảnh báo khi: p95 API vượt budget liên tục, tỷ lệ 5xx tăng, timeout/retry tăng bất thường, payload danh sách vượt ngưỡng, idempotency conflict tăng.
- [ ] Rollout từng giai đoạn riêng biệt, không gộp index + pagination + offline vào một lần phát hành; mỗi thay đổi có feature flag hoặc đường rollback.

---

### Giai đoạn 12 — Đánh giá Cache Components & Instant Navigation (P2/thử nghiệm, 3–6 ngày, rủi ro cao)

*Nguồn: Instant-Nav GĐ6 — chỉ làm sau khi mọi giai đoạn P0/P1 ở trên ổn định*

Next.js 16.2.12 hỗ trợ `cacheComponents` và `unstable_instant`, nhưng `unstable_instant` là **draft API**.

- [ ] Nhánh thử nghiệm riêng, bật `cacheComponents: true`; đọc lại tài liệu trong `node_modules/next/dist/docs/` tại thời điểm triển khai.
- [ ] Chạy build xử lý mọi uncached access ngoài Suspense; không cache dùng chung dữ liệu theo quyền.
- [ ] Bọc phần đọc cookie/dữ liệu runtime trong Suspense gần nhất.
- [ ] Thêm `unstable_instant = { prefetch: "static" }` lần lượt cho route phù hợp; có thể đặt `false` ở dashboard layout nếu entry phụ thuộc cookie.
- [ ] Bật `instantNavigationDevToolsToggle` chỉ cho development; thêm test instant navigation cho 3 luồng quan trọng.

**Điều kiện hoàn thành:** build production thành công với Cache Components; route được chọn vượt qua instant navigation validation; không rò dữ liệu giữa tài khoản; có rollback chỉ bằng config/commit.

---

### Giai đoạn 13 (tùy chọn) — Offline có kiểm soát (P2, theo nhu cầu thật, rủi ro cao)

*Nguồn: Cross-Project GĐ9*

**Khuyến nghị hiện tại: chưa triển khai offline mutation toàn hệ thống** — lợi ích thấp hơn rủi ro xung đột với phần mềm nhiều người dùng. Chỉ làm nếu có quyết định sản phẩm riêng, với thiết kế tối thiểu: IndexedDB (không dùng `localStorage`) cho outbox có cấu trúc, idempotency key cho mọi mutation trong outbox, version/`updated_at` để phát hiện xung đột, trạng thái `pending/syncing/failed/conflict/done` hiển thị người dùng, retry backoff có giới hạn, xóa outbox khi logout theo chính sách bảo mật.

---

## 6. Bảng lịch trình tổng hợp

| Đợt | Giai đoạn | Thời lượng ước tính | Kết quả người dùng thấy |
|---|---|---:|---|
| 1 | GĐ0 (baseline) | 1–2 ngày | Có số đo, biết chính xác điểm nghẽn |
| 2 | GĐ1 (bỏ delay + abort) | 1–2 ngày | Mất delay cố định 300ms, tìm kiếm ổn định |
| 3 | GĐ2 (index DB) | 1–2 ngày | Tìm kiếm/trang sâu nhanh hẳn |
| 4 | GĐ3 (timeout/retry) | 2–4 ngày | Ổn định hơn khi mạng/Supabase chập chờn |
| 5 | GĐ4 (cache phiên + prefetch) | 4–7 ngày | Quay lại trang thấy dữ liệu ngay, hover mở chi tiết tức thời |
| 6 | GĐ5 (server initial data + payload) | 6–10 ngày | Lần đầu mở list không chờ hydrate mới gọi API, ít request/payload hơn |
| 7 | GĐ6 (mutation invalidation) — **xong về code** | 2–4 ngày | Mutation không reload toàn trang, không dữ liệu cũ |
| 8 | GĐ7 (draft form) — **xong về code** | 2–3 ngày | Không mất nội dung khi reload/tab lỗi |
| 9 | GĐ8 (batch API/upload) | 3–5 ngày | Thao tác hàng loạt/upload mượt hơn |
| 10 | GĐ9 (idempotency/RPC) — **idempotency xong về code, RPC chưa làm** | 5–8 ngày | Lưu an toàn, không tạo bản ghi trùng |
| 11 | GĐ10 (audit — **không cần sửa code**) + GĐ11 (quan sát, chưa làm) | 3–5 ngày | Bundle đã gọn từ trước (xác nhận qua audit), có cảnh báo p95 |
| 12 | GĐ12 (Cache Components, thử nghiệm) | 3–6 ngày | Static shell + Instant Navigation được Next validate |
| Tùy chọn | GĐ13 (offline) | Theo nhu cầu | Chỉ làm khi có yêu cầu sản phẩm rõ ràng |

**Nếu chỉ có thời gian làm phần hiệu quả cao nhất, dừng ở Giai đoạn 4** (baseline → bỏ delay → index → timeout/retry → cache/prefetch). Đây là nhóm việc rủi ro thấp/trung bình, cùng được cả 3 tài liệu gốc xác nhận là ưu tiên cao nhất.

## 7. Rủi ro & điều kiện rollback hợp nhất

| Rủi ro | Kiểm soát |
|---|---|
| Hiện dữ liệu cũ | TTL ngắn theo bảng mục 4, revalidate nền, badge cập nhật nếu cần |
| Rò dữ liệu giữa tài khoản/vai trò | Cache key có account/role, clear khi auth đổi |
| Mất/trùng dữ liệu do retry | Idempotency key trước khi bật retry ghi |
| Prefetch gây bão request | Chỉ prefetch theo intent, giới hạn concurrency 2–4, deduplicate |
| Tốn bộ nhớ browser | LRU/entry limit, không cache file/blob lớn |
| Mutation làm cache không nhất quán | Ma trận invalidation (GĐ6) + revalidate xác nhận |
| Migration index khóa ghi kéo dài | Kiểm tra dung lượng trước, lập lịch bảo trì |
| Cache Components/`unstable_instant` gây breaking change | Nhánh riêng, triển khai cuối cùng, rollback bằng config |
| Server initial data làm TTFB tăng | Query trực tiếp, Suspense theo vùng, giảm payload phụ |

**Rollback ngay một giai đoạn nếu:** tài khoản thấy dữ liệu tài khoản/vai trò khác; p95 tăng >20% mà không có lợi ích tương ứng; tỷ lệ lỗi tăng >0,5 điểm phần trăm; UI hiện dữ liệu cũ sau mutation >2s không có trạng thái đồng bộ; bộ nhớ tab tăng liên tục khi chuyển route; back/forward sai trang/filter; production build hoặc auth flow không ổn định.

Mỗi giai đoạn phải là commit độc lập hoặc có feature flag để rollback không ảnh hưởng dữ liệu.

## 8. Checklist bắt buộc cho mỗi giai đoạn

- [ ] Đọc tài liệu Next.js tương ứng trong `node_modules/next/dist/docs/` trước khi dùng API Next mới.
- [ ] Ghi baseline trước khi sửa (dùng lại số đo giai đoạn 0, không tạo báo cáo trùng).
- [ ] Không cache dữ liệu theo quyền ở lớp dùng chung công khai.
- [ ] Không log token, mật khẩu, số tài khoản hoặc payload nhạy cảm.
- [ ] Test đủ vai trò admin/manager/member; test success, validation error, permission error, timeout, mạng chập chờn.
- [ ] Chạy `pnpm lint`, TypeScript check, `pnpm build`.
- [ ] Đo lại median/p95/payload sau thay đổi, so sánh HAR trước/sau.
- [ ] Cập nhật trạng thái trực tiếp trong tài liệu này, không tạo thêm file trạng thái mới.
- [ ] Không đánh dấu hoàn thành chỉ vì cảm giác UI nhanh hơn.

## 9. Kết luận

Ba tài liệu gốc thống nhất ở một điểm: **giá trị nhanh nhất không đến từ tải toàn bộ dữ liệu khi đăng nhập hay sao chép kiến trúc SPA/service worker**, mà đến từ loại bỏ độ trễ nhân tạo (300ms), xử lý đúng race condition, thêm index đã được `EXPLAIN` xác nhận, và chuyển việc tải dữ liệu sang trước-khi-bấm hoặc chạy-ngầm-sau-khi-đã-hiển-thị. Idempotency, RPC transaction, Cache Components và offline là các bước có giá trị nhưng rủi ro cao hơn, nên chỉ triển khai sau khi nền tảng đo lường và các fix rủi ro thấp đã ổn định.
