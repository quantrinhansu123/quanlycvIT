# Báo cáo triển khai Giai đoạn 0 → 5

Ngày triển khai: **02/08/2026**
Nguồn kế hoạch: `PERF-UNIFIED-IMPLEMENTATION-PLAN.md`
Trạng thái: **GĐ0 (một phần)/GĐ1/GĐ2/GĐ3/GĐ4/GĐ5/GĐ6/GĐ7/GĐ9 (idempotency) xong về mặt code + migration đã áp dụng lên database liên kết — chưa đo baseline trên dữ liệu lớn và chưa kiểm thử đủ 3 vai trò bằng tài khoản thật**

---

## 1. Vì sao dừng ở đây

Giai đoạn 0 gốc yêu cầu đo HAR/DevTools Performance/Web Vitals trên trình duyệt thật với bộ dữ liệu lớn (200 dự án, 20.000 công việc, 40.000 task). Việc này cần chạy trình duyệt thật, không thể tự động hóa trong phiên làm việc này. Theo thống nhất với người dùng, đã **bỏ qua phần đo đạc**, chỉ làm phần "code hóa được" của GĐ0 rồi triển khai thẳng GĐ1 (rủi ro thấp, đã được xác nhận là ưu tiên cao nhất trong cả 3 tài liệu gốc).

---

## 2. Đã làm

### Giai đoạn 0 — instrumentation đã hoàn tất về mặt code

**File chính:** `src/lib/api/observability.ts`, `src/lib/api/response.ts`, `src/lib/supabase/api.ts`, `src/lib/supabase/admin.ts`, `src/components/observability/WebVitalsReporter.tsx`, `src/app/api/observability/web-vitals/route.ts`

- Mọi response đi qua `apiSuccess()`/`apiError()` có `x-request-id` và `Server-Timing` gồm `auth`, `db`, `map`, `total`.
- Thời gian xác thực được đo quanh `requireRequestAccount()`/`assertAdminAccount()`; thời gian Supabase/PostgREST được đo tại custom `fetch`; thời gian serialize JSON được đo ở tầng response dùng chung.
- Mỗi response ghi một log JSON `api_response` gồm route pathname (không có query), method, status, duration, timing từng tầng, rows, response bytes và request id. Không log token, body hay PII.
- Web Vitals (`TTFB`, `FCP`, `LCP`, `CLS`, `INP`, tương thích `FID`) được gửi bằng `sendBeacon` tới `/api/observability/web-vitals` và ghi log JSON `web_vital` để có thể tổng hợp theo route.

**Còn phụ thuộc môi trường đo:**
- Chạy `next build && next start`, đo baseline 5 luồng × 3 vai trò bằng HAR/DevTools.
- Tổng hợp p50/p95/p75 từ log production và chốt lại TTL theo baseline thật.

### Giai đoạn 1 — bỏ delay cố định 300ms & chống race condition

**Vấn đề trước khi sửa:** cả 3 trang danh sách dùng chung một anti-pattern — một state `search` duy nhất gắn thẳng vào ô input, và một `useEffect` duy nhất `setTimeout(..., 300)` bọc quanh lệnh gọi API. Hệ quả:
- Mọi lần đổi trang/pageSize/filter (không chỉ gõ tìm kiếm) đều phải chờ thêm 300ms trước khi request bắt đầu.
- Không có `AbortController` — request cũ không bị hủy khi filter đổi nhanh, có thể khiến response cũ ghi đè response mới (race condition).

**Cách sửa (áp dụng đồng nhất cho cả 3 trang):**

1. Tách state tìm kiếm làm hai: `searchInput` (giá trị gõ trực tiếp, gắn vào `<input>`) và `search` (giá trị đã áp dụng, dùng để gọi API). Một `useEffect` riêng debounce 300ms chỉ để commit `searchInput → search` — **không** còn giữ vai trò trì hoãn gọi API.
2. Effect gọi API (phụ thuộc `search`, `page`, `pageSize`, các filter khác) giờ gọi ngay lập tức, không qua timer. Vì vậy đổi trang/pageSize/filter chọn sẵn không còn delay nhân tạo; chỉ riêng việc gõ tìm kiếm mới có độ trễ 300ms (do `search` chỉ đổi sau khi debounce commit).
3. Thêm `AbortController` trong effect gọi API: tạo controller mới mỗi lần effect chạy, `return () => controller.abort()` để hủy request đang chạy dở khi effect re-run (đổi filter) hoặc unmount.
4. Các hàm `loadProjects`/`loadTasks`/`loadSubtasks` nhận thêm tham số `signal?: AbortSignal`, forward xuống service; nếu request bị abort thì bỏ qua cập nhật state (không set `error`, không toast, không tắt `loading` sai lúc).
5. Chuẩn hóa 3 service tương ứng (`project-service.ts`, `task-service.ts`, `subtask-service.ts`) nhận `options?: { signal?: AbortSignal }` và forward vào `apiClient.get(url, { signal })`. `api-client.ts` không cần sửa vì `RequestInit` (đối số thứ 2 của `fetch`) đã hỗ trợ `signal` sẵn, chỉ cần các service truyền xuống.

Pattern này tham khảo theo cách `FinanceManagementPage.tsx` đã làm đúng từ trước (dùng `AbortController` + kiểm tra `AbortError` trong `catch`), áp dụng lại cho 3 trang còn thiếu.

**File đã sửa:**
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/page.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-cong-viec/page.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-task/page.tsx`
- `src/services/project-service.ts`
- `src/services/task-service.ts`
- `src/services/subtask-service.ts`

**Bổ sung sau đó:** `SessionDataCache` hiện có version theo key và epoch toàn cache; response cũ không được ghi cache sau `abort`/`invalidate`/`clear`, kể cả transport resolve muộn. Xem mục 10.3.

---

## 3. Một vướng mắc lint và cách xử lý

Rule `react-hooks/set-state-in-effect` báo lỗi khi effect gọi thẳng hàm async có `setState` ở đầu thân hàm (vd. `loadProjects(...)` gọi `setLoading(true)` ngay dòng đầu), kể cả khi bọc `void`. Đây là false positive vì hàm là async và có `AbortSignal` guard. Xử lý theo đúng tiền lệ đã có trong `FinanceManagementPage.tsx:115` — thêm `// eslint-disable-next-line react-hooks/set-state-in-effect` ngay trên dòng gọi.

---

## 4. Đã kiểm tra

- `pnpm lint` — pass, không còn lỗi/warning.
- `pnpm exec tsc --noEmit` — pass, không lỗi kiểu.
- `pnpm build` — build production thành công (Next.js 16.2.12, Turbopack).

**Chưa kiểm tra (cần bạn tự làm trên trình duyệt):**
- Gõ nhanh 10 ký tự vào ô tìm kiếm ở cả 3 trang → chỉ nên thấy 1–2 request Network hoàn tất (không phải 10).
- Đổi filter A → B → A liên tiếp khi mạng giả lập chậm (Chrome DevTools → Network → Slow 3G) → dữ liệu cuối cùng hiển thị phải khớp với lựa chọn cuối (A), không bị response cũ của B ghi đè.
- Đổi trang/pageSize không còn thấy độ trễ ~300ms trước khi request bắt đầu (Network tab, cột Waterfall).
- Response header `x-request-id` xuất hiện trên mọi API `/api/**`.

---

## 5. Việc còn lại sau phần code

Theo thứ tự trong `PERF-UNIFIED-IMPLEMENTATION-PLAN.md`:

- **Đo lại GĐ0 thật** bằng HAR/DevTools trên `next build && next start` để có baseline p50/p95 trước khi đánh giá các giai đoạn sau có đạt chỉ tiêu không — vẫn là việc còn thiếu lớn nhất xuyên suốt toàn bộ báo cáo này.
- Phần còn lại của GĐ5 đã hoàn tất về mặt code ngày 02/08/2026; xem mục 10.
- Các giai đoạn sau đã được triển khai theo trạng thái tổng hợp ở đầu tài liệu; việc còn mở trong phạm vi báo cáo này là phép đo dữ liệu lớn và kiểm thử đủ ba vai trò.

---

## 6. Giai đoạn 2 — Index tìm kiếm & phân trang (bổ sung 02/08/2026)

### 6.1 Xác minh trước khi sửa

Database Supabase của dự án **đã liên kết và có thể truy vấn được** qua `pnpm exec supabase db query --linked` (không phải chỉ staging giả định) — dùng luôn để xác minh thay vì đoán:

- Tên bảng/cột thực tế khớp 100% với bản nháp SQL đã có sẵn trong `PERF-UNIFIED-IMPLEMENTATION-PLAN.md`: `cong_viec.ten_cv`, `task.ten_task`, cả hai bảng đều có cột `created_at`.
- Dung lượng bảng hiện tại (qua `pg_stat_user_tables`): `du_an` 4 dòng, `cong_viec` 18 dòng, `task` 24 dòng — đây là **dữ liệu môi trường dev/test**, không phải quy mô production (200 dự án/20.000 công việc/40.000 task) mà chỉ tiêu hiệu năng trong kế hoạch nhắm tới.
- Chưa có index trigram hay index `(created_at, id)` nào tồn tại trước đó (qua `pg_indexes`) — không xung đột tên.
- `EXPLAIN (ANALYZE, BUFFERS)` trước khi sửa xác nhận đúng chẩn đoán gốc: `Seq Scan on cong_viec ... Filter: (ten_cv ~~* '%viec%'::text)`.

### 6.2 Migration đã tạo và áp dụng

**File:** `supabase/migrations/20260802000100_search_and_pagination_indexes.sql`

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

Nội dung giống hệt bản nháp trong kế hoạch — không cần chỉnh sửa vì tên bảng/cột đã đúng ngay từ đầu.

Vì dữ liệu hiện tại rất nhỏ (dưới 25 dòng/bảng), rủi ro khóa ghi kéo dài trên bảng lớn (mối lo chính của bước này theo kế hoạch) **không áp dụng ở thời điểm này**. Đã hỏi xác nhận người dùng trước khi chạy `supabase db push --linked` lên database đang liên kết (không tự ý áp dụng thay đổi schema). Migration áp dụng thành công, gần như tức thì.

### 6.3 Kết quả đo lại

- Index đã được tạo, xác nhận qua `pg_indexes`: `cong_viec_ten_cv_trgm_idx`, `task_ten_task_trgm_idx`, `cong_viec_created_at_id_idx`, `task_created_at_id_idx`.
- Ép planner không dùng Seq Scan (`set enable_seqscan = off`) để kiểm tra index có hợp lệ và dùng được không:
  - `cong_viec`: `Bitmap Index Scan using cong_viec_ten_cv_trgm_idx` khi lọc theo `ten_cv ilike ...` — **hợp lệ**.
  - `task`: `Bitmap Index Scan using task_ten_task_trgm_idx` — **hợp lệ**.
  - `cong_viec` với `order by created_at desc limit`: `Index Scan using cong_viec_created_at_id_idx` — **hợp lệ**.
- **Ở chế độ mặc định (không ép), planner vẫn chọn `Seq Scan`** cho cả 2 bảng vì dữ liệu quá nhỏ (dưới 25 dòng) — đây là hành vi đúng của cost-based optimizer (quét tuần tự 18-24 dòng rẻ hơn dùng index), **không phải index bị lỗi hay bị bỏ qua**. Postgres sẽ tự chuyển sang dùng index khi số dòng tăng đủ lớn, không cần can thiệp gì thêm.

### 6.4 Giới hạn của lần đo này — quan trọng, cần đọc trước khi báo "GĐ2 xong"

Theo đúng điều kiện hoàn thành trong kế hoạch ("median tìm kiếm và trang sâu giảm rõ so với baseline giai đoạn 0"), **chưa thể kết luận GĐ2 đạt mục tiêu** vì:

1. Chưa có baseline p50/p95 thật từ GĐ0 (GĐ0 mới chỉ code phần `x-request-id`, chưa đo HAR/DevTools).
2. Dữ liệu hiện tại (4/18/24 dòng) quá nhỏ để đo được chênh lệch có ý nghĩa giữa Seq Scan và Index Scan — cả hai đều mất dưới 2ms.

**Cần làm để xác nhận thật sự:** nạp bộ dữ liệu lớn theo `PERF-LARGE-DATA-LOAD-TEST-README.md` (200 dự án, 20.000 công việc, 40.000 task) vào database rồi đo lại `EXPLAIN (ANALYZE, BUFFERS)` — lúc đó mới thấy rõ chênh lệch Seq Scan (chậm dần theo số dòng) so với Index Scan (gần như không đổi).

### 6.5 File thay đổi trong GĐ2

- `supabase/migrations/20260802000100_search_and_pagination_indexes.sql` (mới)
- Không có thay đổi code ứng dụng (`src/**`) — GĐ2 chỉ ở tầng database, đúng phạm vi kế hoạch.

---

## 7. Giai đoạn 3 — Timeout & retry có kiểm soát (bổ sung 02/08/2026)

### 7.1 Vấn đề trước khi sửa

`src/services/api-client.ts` gọi thẳng `fetch()` không có `signal`/timeout riêng (ngoài signal caller tự truyền từ GĐ1) — một request treo do server/mạng chậm sẽ giữ `loading: true` vô thời hạn, không có cách nào tự phục hồi. Không có cơ chế retry nào cho lỗi tạm thời (503, mất mạng chập chờn).

### 7.2 Cách sửa

Viết lại toàn bộ `src/services/api-client.ts` (không đổi API bề mặt — `apiClient.get/post/put/patch/delete/postFormData` vẫn nhận `options?: RequestInit`-compatible, chỉ mở rộng thêm field tùy chọn `timeoutMs`):

1. **Timeout theo loại request** — không cần caller khai báo gì thêm, tự suy ra từ method/body:
   - GET/HEAD (danh sách): 15s.
   - POST/PUT/PATCH/DELETE (mutation JSON): 20s.
   - `postFormData` (phát hiện qua `body instanceof FormData`): 30s.
   - Ghi đè được qua `options.timeoutMs` nếu một API cụ thể cần khác.
2. **Gộp signal caller + signal timeout** (`combineSignals()`): tạo `AbortController` nội bộ cho timeout, lắng nghe cả hai signal, abort chung khi một trong hai kích hoạt. Khi bắt lỗi, phân biệt nguồn gốc bằng `callerSignal?.aborted`:
   - Do caller (component unmount/đổi filter — cơ chế GĐ1) → ném lại `AbortError` gốc, giữ nguyên hành vi cũ (nơi gọi tự bỏ qua, không toast).
   - Do hết giờ → ném `ApiError("...quá thời gian chờ...", 0, "timeout")` — **khác `AbortError`** nên không bị các trang danh sách nhầm là "bị hủy, bỏ qua"; UI vẫn nhận được lỗi và hiển thị toast + tắt loading như lỗi bình thường.
3. **Retry cho GET/HEAD** (tối đa 2 lần, tổng tối đa 3 lần gọi): backoff 300ms rồi 800ms + jitter ngẫu nhiên (0–100ms) để tránh nhiều tab/nhiều tab đồng thời retry cùng lúc gây "thundering herd". Điều kiện retry: lỗi mạng, hoặc response có status 408/429/502/503/504. Nếu response có header `Retry-After` (số giây hoặc HTTP-date), ưu tiên chờ theo đó thay vì backoff mặc định.
4. **Không retry khi:** caller đã abort, đã hết lượt, hoặc `document.visibilityState === "hidden"` — cách thực tế nhất trong trình duyệt để nhận biết "tab không còn hoạt động" (JS không có sự kiện "tab đã đóng hẳn" đáng tin cậy).
5. **Mutation (POST/PUT/PATCH/DELETE/upload) không bao giờ retry** — đúng nguyên tắc bắt buộc của kế hoạch (mục 3): chỉ retry ghi khi có idempotency key, mà GĐ9 (idempotency) chưa triển khai.
6. **Phân loại lỗi (`ApiError.kind`):** `auth` (401/403), `timeout` (408 hoặc hết giờ), `server` (5xx), `validation` (4xx còn lại), `network` (fetch reject không phải AbortError — mất mạng/DNS/CORS), `unknown` (fallback). Các trang hiện tại dùng `getErrorMessage()` chỉ đọc `error.message` nên **tương thích ngược hoàn toàn, không cần sửa** — `kind` sẵn sàng cho UI sau này muốn hiển thị khác nhau theo nhóm lỗi (ví dụ: nút "Thử lại" riêng cho `network`/`timeout`).

**Việc không làm:** log JSON có cấu trúc (route/method/status/duration/request id) ở phía client — mục này thuộc phần "Ghi request id vào log" của GĐ3, cần quyết định nơi gửi log (console, Sentry, hay bảng riêng) trước khi làm, để lại cho vòng sau cùng với phần logging server chi tiết của GĐ0.

### 7.3 File thay đổi

- `src/services/api-client.ts` (viết lại toàn bộ, không đổi chữ ký `apiClient.*` nên không cần sửa bất kỳ service/trang nào đang gọi qua nó).

### 7.4 Đã kiểm tra

- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` — đều pass.
- Rà soát toàn bộ codebase: không có nơi nào khác import `ApiError` hay dùng `error.status` từ `api-client.ts` ngoài chính file đó — thêm field `kind` vào `ApiError` không phá vỡ chỗ nào.

**Chưa kiểm tra (cần bạn tự làm bằng DevTools):**
- Network throttling/offline → xác nhận GET tự retry khi gặp lỗi mạng tạm thời.
- Chrome DevTools → Network → chặn response để mô phỏng 503 → xác nhận GET tự phục hồi sau backoff.
- Giảm `timeoutMs` tạm thời (hoặc dùng proxy làm chậm response) để xác nhận UI thoát loading đúng lúc, báo lỗi "quá thời gian chờ" thay vì treo vô hạn.
- Xác nhận mutation (tạo/sửa/xóa) khi mất mạng giữa chừng **không** tự động gửi lại (đúng thiết kế — tránh ghi trùng khi chưa có idempotency key).

---

## 8. Giai đoạn 4 — Cache phiên & prefetch theo ý định (bổ sung 02/08/2026)

Đây là giai đoạn lớn nhất từ đầu tới giờ (kế hoạch ước tính 4–7 ngày). Đã làm trọn phần hạ tầng cache + tích hợp vào cả 3 trang danh sách + prefetch cho bảng, nhưng có một số phần bị thu hẹp phạm vi có chủ đích — ghi rõ ở mục 8.4 để không ai nhầm là "xong 100%".

### 8.1 Hạ tầng cache mới

**File mới:**
- `src/lib/client-cache/session-data-cache.ts` — class `SessionDataCache`: `get/set/fetch/prefetch/invalidate/clear/subscribe` + hàm `buildCacheKey()`.
- `src/lib/client-cache/ttl.ts` — hằng số TTL theo bảng mục 4 của kế hoạch (`list`: fresh 15s/stale 2 phút; `directory`: fresh 5 phút/stale 15 phút).
- `src/lib/client-cache/resources.ts` — tên resource dùng chung giữa các trang (`projects-list`, `tasks-list`, `subtasks-list`, `directory-members`, `directory-projects`, `directory-tasks`).
- `src/components/providers/SessionDataCacheProvider.tsx` — Context cấp phát một `SessionDataCache` instance dùng chung toàn dashboard qua `useSessionDataCache()`.
- `src/hooks/useSessionQuery.ts` — hook đọc/ghi cache theo key, tự fetch khi cache miss/stale, expose `data/status/isRevalidating/error/refresh/setData`.
- `src/hooks/usePrefetchSessionQuery.ts` — hook mỏng gọi `cache.prefetch()`.
- `src/components/navigation/IntentPrefetchLink.tsx` — bọc `next/link`, prefetch route khi hover/focus/chạm.

**Cơ chế `SessionDataCache` (session-data-cache.ts):**
- **Dedupe:** `fetch(key, fetcher, ttl)` — nếu key đang có request chạy dở (`pending` Map) thì trả lại đúng promise đó thay vì bắn request mới. Vì mỗi key ghi kết quả vào đúng key của nó, response cũ **không thể** ghi đè response mới của key khác — không cần sequence id riêng như kế hoạch cân nhắc.
- **LRU:** `Map` giữ thứ tự chèn; mỗi lần `get()` "chạm" vào entry sẽ dời nó xuống cuối; `set()` gọi `evictOverflow()` xóa entry cũ nhất khi vượt 200 entry (giới hạn cứng, không cấu hình theo kích thước byte thực tế — đơn giản hóa có chủ đích theo đúng khuyến nghị "không tự xây thêm phức tạp" của kế hoạch).
- **Prefetch có giới hạn đồng thời:** tối đa 3 prefetch chạy song song, hàng đợi tối đa 20 — khớp yêu cầu "giới hạn đồng thời 2–4" của kế hoạch (chọn 3, ở giữa khoảng).
- **`invalidate(resource, exceptKey?)`:** xóa toàn bộ entry có tiền tố `resource|`, abort mọi request đang chạy dở khớp resource đó, và bắn `notify()` cho các hook đang subscribe (buộc re-render/refetch). Tham số `exceptKey` để mutation-handler ghi dữ liệu mới vào đúng key hiện tại trước rồi xóa các key khác — tránh có một khoảng khắc dữ liệu biến mất giữa lúc invalidate và lúc set lại (xem 8.3).
- **`clear()`:** abort toàn bộ pending + xóa sạch entries — gọi từ `SessionDataCacheProvider` khi `onAuthStateChange` bắn `SIGNED_OUT`/`SIGNED_IN`.

**Khóa cache (`buildCacheKey`):** đúng công thức bắt buộc trong kế hoạch — `resource|accountId|role|normalizedFilters|pPage|sPageSize` (bỏ đoạn phân trang nếu resource không phân trang, ví dụ directory). Nhờ vậy 3 trang danh sách (dự án/công việc/task) đều dùng chung một khóa `directory-members`/`directory-projects`/`directory-tasks` theo `accountId+role` — **chuyển qua lại giữa 3 trang không phải tải lại danh bạ thành viên/dự án/công việc lần thứ hai** trong TTL 5 phút.

### 8.2 `useSessionQuery` — stale-while-revalidate

- Đọc `cache.get(key)` mỗi render; nếu chưa có hoặc đã stale (`cache.isStale(key)`) thì tự gọi `cache.fetch()` trong `useEffect`, nhưng **vẫn hiện dữ liệu cũ đang có trong lúc revalidate nền** (không có state `data` nào bị xóa về `undefined` chỉ vì đang tải lại) — đúng quy tắc "stale nhưng dùng được → hiện ngay + revalidate nền" của kế hoạch.
- Revalidate nền lỗi: giữ nguyên dữ liệu cũ trong cache, chỉ set `error` — trang gọi `notify()` báo toast, không xóa bảng đang hiển thị.
- `refresh()`: `cache.invalidate(key)` rồi tăng một bộ đếm nội bộ để buộc effect fetch lại — dùng cho nút "Thử lại" (`ErrorState onRetry`) và các luồng "sau khi duyệt/báo cáo/lưu thì tải lại" ở trang task (vốn không có optimistic update, chỉ full-refetch).
- `setData()`: ghi thẳng vào cache dưới key hiện tại — dùng cho optimistic update sau mutation (trang dự án/công việc) hoặc patch cục bộ (trang task, ví dụ sau khi accept task).
- Có 2 chỗ phải thêm `// eslint-disable-next-line react-hooks/set-state-in-effect` (đặt `isRevalidating`) và đổi cách gán `fetcherRef.current` từ trực tiếp trong thân render sang trong `useEffect` — rule mới `react-hooks/refs` của ESLint config này cấm ghi `ref.current` ngay trong render, phải ghi trong effect/event handler.

### 8.3 Tích hợp vào 3 trang danh sách

- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/page.tsx`, `danh-sach-cong-viec/page.tsx`, `danh-sach-task/page.tsx`: bỏ toàn bộ `useState` cho `projects/tasks/subtasks/total/loading/error` + `useCallback loadX` + `useEffect` gọi API thủ công (còn lại từ GĐ1) — thay bằng `useSessionQuery` đọc trực tiếp từ cache. Cơ chế chống race-condition của GĐ1 (AbortController theo key) giờ nằm trong `SessionDataCache.fetch()`, không cần code lại ở từng trang.
- Trang dự án và công việc **vẫn giữ `useOptimistic`** (UI cập nhật ngay khi bấm Lưu, trước khi server trả về) — chỉ đổi nguồn dữ liệu gốc từ `useState` sang `useSessionQuery`. Trang task không có optimistic update (giữ nguyên hành vi cũ: gọi lại `refresh()` sau khi lưu/duyệt/báo cáo).
- **Thứ tự bắt buộc sau mutation:** `setData(...)` (ghi dữ liệu mới vào key hiện tại) **trước**, `cache.invalidate(resource, currentKey)` (xóa các trang/bộ lọc khác, trừ key vừa ghi) **sau**. Ban đầu code viết ngược thứ tự (invalidate trước) — phát hiện lại khi tự rà soát: vì `invalidate()` xóa theo tiền tố resource, gọi trước `setData()` sẽ xóa luôn đúng cái vừa định ghi, khiến UI có khả năng chớp về rỗng/skeleton trước khi có dữ liệu mới. Đã sửa lại thứ tự ở cả 3 trang trước khi build/lint lần cuối.
- Dự án/công việc mới/xóa còn kéo theo `cache.invalidate("directory-projects")`/`cache.invalidate("directory-tasks")` để dropdown chọn dự án/công việc-tiền-đề ở các trang khác không hiển thị dữ liệu cũ.

### 8.4 Prefetch theo ý định — đã hoàn tất phần có tác dụng với kiến trúc hiện tại

**Đã làm:** đổi nút tên bản ghi trong `ProjectTable`/`TaskTable`/`SubtaskTable` (chế độ xem bảng — chế độ mặc định) từ `<button onClick={() => router.push(...)}>` sang `<IntentPrefetchLink href=...>`. Vì cả 2 nơi gọi `TaskTable`/`SubtaskTable` (trang danh sách chính + panel trong trang chi tiết dự án/công việc) đều dùng chung một mẫu URL, đã bỏ hẳn prop `onOpenTask`/`onOpenSubtask` (không còn cần callback vì `Link` tự điều hướng) — cập nhật cả 4 nơi gọi (`ProjectTasksPanel.tsx`, `WorkTaskSubtasksPanel.tsx`, 2 trang danh sách).

**Bổ sung hoàn tất:**
- Tiêu đề ở cả ba chế độ Card (`ProjectCard`/`TaskCard`/`SubtaskCard`) đã dùng `IntentPrefetchLink`; các nút Sửa/Xóa vẫn tách biệt nên không tạo phần tử tương tác lồng nhau.
- Thông báo có task trong Header gọi `router.prefetch()` khi hover/focus trước khi điều hướng. Sidebar tiếp tục dùng `next/link`, vốn tự prefetch route đủ điều kiện khi link đi vào viewport.
- Không nối `onIntent` để tải JSON vào `SessionDataCache`: trang chi tiết là Server Component và không đọc client cache này, nên thao tác đó chỉ tạo request thừa. Prefetch RSC route bằng Next.js là cơ chế đúng với kiến trúc hiện tại.

### 8.5 File thay đổi trong GĐ4

Mới:
- `src/lib/client-cache/session-data-cache.ts`, `ttl.ts`, `resources.ts`
- `src/components/providers/SessionDataCacheProvider.tsx`
- `src/hooks/useSessionQuery.ts`, `usePrefetchSessionQuery.ts`
- `src/components/navigation/IntentPrefetchLink.tsx`

Sửa:
- `src/app/(dashboard)/layout.tsx` (thêm `SessionDataCacheProvider`)
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/page.tsx`, `danh-sach-cong-viec/page.tsx`, `danh-sach-task/page.tsx` (chuyển sang `useSessionQuery`)
- `src/components/projects/ProjectTable.tsx`, `src/components/tasks/TaskTable.tsx`, `src/components/subtasks/SubtaskTable.tsx` (tên bản ghi → `IntentPrefetchLink`, bỏ prop `onOpenTask`/`onOpenSubtask`)
- `src/components/projects/ProjectTasksPanel.tsx`, `src/components/subtasks/WorkTaskSubtasksPanel.tsx` (bỏ prop đã xóa khỏi `TaskTable`/`SubtaskTable`)
- `src/services/project-service.ts` (`getDirectory`/`getProjects` nhận `signal`), `src/services/task-service.ts` (`getTasks` nhận `signal`) — cần thiết để `useSessionQuery` truyền `AbortSignal` xuống fetcher.

### 8.6 Đã kiểm tra

- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` — đều pass sau khi sửa xong.
- Rà soát lại thứ tự `invalidate`/`setData` ở cả 3 trang sau khi phát hiện vấn đề mô tả ở 8.3 — đã sửa và build lại lần cuối để xác nhận.

**Chưa kiểm tra (cần bạn tự làm bằng trình duyệt thật — đây là phần quan trọng nhất còn thiếu của GĐ4):**
- Mở trang dự án → chuyển sang trang công việc → quay lại trang dự án trong vòng 15s: dữ liệu phải hiện ngay, không có skeleton toàn bảng, không có request network mới (Network tab).
- Mở React DevTools/Network tab, gõ nhanh vào ô tìm kiếm ở một trang danh sách trong khi đã có dữ liệu cache từ trước: xác nhận không có "nhấp nháy" dữ liệu.
- Hover vào tên một dự án/công việc/task trong bảng, đợi ~200ms rồi bấm: xác nhận không có độ trễ điều hướng rõ rệt so với bấm ngay lập tức (do `router.prefetch` đã chạy khi hover).
- Đăng xuất rồi đăng nhập lại bằng tài khoản khác trên cùng trình duyệt: xác nhận trang danh sách không hiện thoáng qua dữ liệu của tài khoản trước (cache đã bị `clear()`).
- Tạo/sửa/xóa một dự án, sau đó mở trang công việc rồi quay lại trang dự án: xác nhận dropdown lọc theo dự án ở trang công việc phản ánh đúng thay đổi (nhờ `invalidate("directory-projects")`).
- Kiểm tra `Tab`/`Shift+Tab` qua tên các bản ghi trong bảng vẫn nhận focus đúng thứ tự, `Enter` mở được trang chi tiết, chuột giữa/`Ctrl+Click` mở tab mới đúng như một thẻ `<a>` bình thường (đây là điểm `IntentPrefetchLink` dùng `next/link` nên về lý thuyết đã hỗ trợ sẵn, nhưng chưa tự bấm thử).

---

## 9. Giai đoạn 5 — Server initial data (bổ sung 02/08/2026, một phần)

Kế hoạch chia GĐ5 làm 3 nhóm việc: "Server initial data", "Thu nhỏ dữ liệu phụ", "Mở rộng server-side pagination". **Chỉ nhóm đầu tiên được làm trong đợt này.** Hai nhóm sau chưa động vào — lý do ở mục 9.4.

### 9.1 Vấn đề trước khi sửa

Cả 3 trang danh sách là Client Component thuần (`"use client"`), tự fetch dữ liệu trong `useEffect` sau khi mount. Trình tự thực tế khi vào trang: server trả một shell HTML gần như rỗng → trình duyệt tải JS → hydrate → `useCurrentAccount()` (Context, tự gọi `supabase.auth.getSession()` rồi query bảng `tai_khoan`) resolve xong mới biết `accountId`/`role` → lúc đó `useSessionQuery` mới có đủ dữ liệu để tính cache key → mới gọi API. Đây chính là waterfall `hydrate → getSession → API` mà kế hoạch muốn loại bỏ.

Khảo sát trước khi sửa (bằng subagent, không đoán): 3 trang chi tiết (`danh-sach-du-an/[id]`, `danh-sach-cong-viec/[id]`, `danh-sach-task/[id]`) **đã** là Server Component từ trước, dùng đúng pattern GĐ5 muốn — `createServerSupabaseClient()` (đọc cookie, đã có sẵn trong `src/lib/supabase/api.ts`) + `requireRequestAccount()` (đã có sẵn trong `src/lib/supabase/authorization.ts`, 1 lượt query `tai_khoan`, xác thực JWT cục bộ không tốn round-trip mạng) + gọi thẳng hàm trong `src/lib/supabase/data.ts` + hydrate `*DetailView.tsx` bằng prop `initial*`. Không cần xây plumbing auth mới — chỉ cần lặp lại đúng pattern đã chạy production cho 3 trang danh sách.

### 9.2 Cách sửa

Cho cả 3 trang (`danh-sach-du-an`, `danh-sach-cong-viec`, `danh-sach-task`):

1. `page.tsx` cũ (toàn bộ logic client) đổi tên nội dung thành `*ListClient.tsx` (`ProjectListClient.tsx`/`TaskListClient.tsx`/`SubtaskListClient.tsx`), thêm prop `accountId`/`accountRole` + `initial*` cho từng loại dữ liệu; **bỏ hẳn `useCurrentAccount()`** trong 3 file này — `accountId`/`accountRole` giờ đến từ prop server truyền xuống ngay từ lần render đầu, không phải đợi Context client resolve.
2. `page.tsx` mới là **Server Component** (bỏ `"use client"`, thêm `async`): gọi `createServerSupabaseClient()` → `requireRequestAccount()` → tính `readOnly`/`participantAccountId` giống hệt logic role-scoping trong các route `/api/projects`, `/api/tasks`, `/api/subtasks` (đã đọc kỹ từng route trước khi viết lại, không đoán) → `Promise.all(...)` gọi thẳng `listProjectsPage`/`listWorkTasksPage`/`listSubtasksPage` + các hàm directory (`listDirectory`, `listProjects`, `listWorkTasks`) → render `<XListClient accountId=... accountRole=... initial*=... />`.
3. Thêm `initialData?: T` vào `useSessionQuery` (`src/hooks/useSessionQuery.ts`): ghi thẳng `initialData` vào `SessionDataCache` **trước khi có render đầu tiên**, bằng `useState(() => {...; return null})` — lazy initializer của `useState` chạy đúng một lần, kể cả trong lượt render phía server của Client Component (Next.js vẫn SSR các Client Component trong cây trang). Nhờ vậy HTML server trả về đã có sẵn dữ liệu thật (không phải skeleton), và lần hydrate đầu tiên ở client khớp y hệt HTML server (không lệch hydration). Chỉ áp dụng cho đúng lần mount đầu của đúng key đó — đổi filter/trang sau đó đi qua đường fetch cache bình thường như không có `initialData`.

### 9.3 Xác nhận đã đúng hướng — không phải chỉ "code chạy được"

- `pnpm build`: cả 3 route (`/quan-ly-cong-viec/danh-sach-du-an`, `danh-sach-cong-viec`, `danh-sach-task`) đổi ký hiệu từ `○` (Static, prerender một lần lúc build) sang `ƒ` (Dynamic, server-render mỗi request) — đây là bằng chứng khách quan (không phải suy luận) rằng Next.js giờ coi các trang này là phụ thuộc dữ liệu runtime (cookie phiên đăng nhập), đúng như thiết kế.
- Chạy thử `next build && next start`, `curl` vào cả 3 route khi **chưa đăng nhập**: nhận `307` (redirect, do `src/proxy.ts` chặn ở edge trước khi vào tới trang) cho `danh-sach-cong-viec`/`danh-sach-task`, và theo redirect (`curl -L`) tới trang `/dang-nhap` trả `200` cho `danh-sach-du-an` — không có lỗi `500`, xác nhận Server Component mới không crash khi không có phiên đăng nhập (tình huống mà proxy vốn đã chặn từ trước, nhưng vẫn đáng kiểm tra vì code Server Component là hoàn toàn mới).
- **Chưa test được luồng đã đăng nhập** — không có tài khoản thật để đăng nhập trong phiên làm việc này. Đây là khoảng trống lớn nhất của đợt sửa này, xem mục 9.5.

### 9.4 Ghi chú lịch sử: hai nhóm từng được hoãn, nay đã hoàn tất

Nội dung dưới đây giải thích quyết định ở lần triển khai đầu. Trạng thái hiện tại: cả "Thu nhỏ dữ liệu phụ" và "Mở rộng server-side pagination" đã hoàn tất; xem mục 10.

Quyết định có chủ đích dừng ở đây, không làm tiếp 2 nhóm còn lại của GĐ5 trong cùng một đợt, vì:

- **Rủi ro khác hẳn nhóm vừa làm.** "Server initial data" chỉ đổi *nơi gọi* các hàm data-access đã có sẵn (từ client-qua-API sang server-trực-tiếp) — không đổi field nào trong response, không đổi hành vi nghiệp vụ. "Thu nhỏ dữ liệu phụ" (bớt field trả về, đổi shape response) và "Mở rộng pagination" (thêm `page`/`pageSize` cho `/api/accounts`) đụng vào **shape dữ liệu mà UI hiện tại đang đọc trực tiếp** — ví dụ `AccountManagementPage.tsx` hiện tải toàn bộ `tai_khoan` một lần rồi tự lọc/sắp xếp phía client (`useMemo`, xem `agents/PERF-LOGIN-PAGELOAD-OPTIMIZATION-README.md`/code hiện tại) — bớt field hoặc thêm phân trang server cho `/api/accounts` bắt buộc phải sửa cả cách `AccountManagementPage.tsx` lọc/sắp xếp (chuyển từ lọc client sang lọc server), không thể chỉ sửa route.
- Đã xác nhận bằng cách đọc trực tiếp `src/app/api/accounts/route.ts` + `src/lib/supabase/accounts.ts`: `GET /api/accounts` hiện trả **toàn bộ bảng `tai_khoan`** mỗi lần gọi (không `page`/`pageSize`), kèm các trường nhạy cảm/không cần cho list view: `so_tai_khoan`/`ten_ngan_hang` (số tài khoản & tên ngân hàng), `dia_chi`, `ngay_sinh`, `ghi_chu`. Đây là phát hiện thật, không phải suy đoán từ kế hoạch — nhưng sửa đúng cách cần thiết kế lại luồng lọc/sắp xếp của `AccountManagementPage.tsx`, ngoài phạm vi một đợt sửa nhanh.
- Theo đúng nguyên tắc rollout của kế hoạch (mục 7): "mỗi giai đoạn phải là commit độc lập... không gộp nhiều thay đổi rủi ro khác nhau vào một lần phát hành." Gộp thêm việc đổi payload/pagination accounts vào cùng đợt với Server Component conversion sẽ làm khó xác định nguyên nhân nếu có lỗi.

### 9.5 File thay đổi trong GĐ5

Mới:
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/ProjectListClient.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-cong-viec/TaskListClient.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-task/SubtaskListClient.tsx`

Viết lại thành Server Component:
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-du-an/page.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-cong-viec/page.tsx`
- `src/app/(dashboard)/quan-ly-cong-viec/danh-sach-task/page.tsx`

Sửa:
- `src/hooks/useSessionQuery.ts` (thêm `initialData`)

### 9.6 Đã kiểm tra / chưa kiểm tra

**Đã kiểm tra:**
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` — đều pass.
- `next build && next start` + `curl` luồng chưa đăng nhập cho cả 3 route — không lỗi `500`, redirect đúng như proxy đã cấu hình từ trước.
- Ký hiệu route trong output `next build` đổi từ Static sang Dynamic — xác nhận khách quan việc chuyển sang Server Component có hiệu lực.

**Chưa kiểm tra — cần bạn tự làm bằng trình duyệt thật, đăng nhập bằng cả 3 vai trò (admin/manager/member):**
- Mở từng trang trong 3 trang danh sách bằng "View Page Source" hoặc tắt JavaScript tạm thời: xác nhận HTML server trả về đã có sẵn dữ liệu bảng (tên dự án/công việc/task thật), không phải khung rỗng chờ JS tải dữ liệu.
- Trên tab Network của DevTools, tải lại trang: xác nhận **không có** request gọi tới `/api/projects`, `/api/tasks`, `/api/subtasks`, `/users` ngay sau khi trang load xong (vì đã có `initialData`, không cần refetch trong TTL fresh 15s) — chỉ thấy các request này khi đổi filter/trang hoặc sau 15s.
- Đăng nhập bằng tài khoản `member`: xác nhận trang công việc/task chỉ hiện đúng công việc/task được giao cho mình (kiểm tra lại logic `assigneeIds: [access.id]` áp cho đúng trường hợp), trang dự án chỉ hiện dự án mình tham gia.
- Đăng nhập bằng tài khoản `manager`/`admin`: xác nhận thấy đầy đủ dữ liệu như trước khi sửa (không bị thu hẹp nhầm phạm vi).
- Vào thẳng URL trang danh sách khi **chưa đăng nhập** trên trình duyệt thật (không chỉ `curl`): xác nhận redirect về `/dang-nhap` mượt, không có lỗi hiển thị (flash nội dung lỗi) trước khi redirect.
- So sánh cảm giác tốc độ vào trang lần đầu (sau khi đăng nhập, bấm vào menu Sidebar) giữa bản trước và sau GĐ5 — đây là phép đo chủ quan tạm thời, cần thay bằng số đo LCP/TTFB thật khi làm GĐ0 baseline.

---

## 10. Hoàn tất phần còn lại của Giai đoạn 5 (bổ sung 02/08/2026)

### 10.1 Thu nhỏ dữ liệu phụ

- `GET /api/projects?directory=true` và `GET /api/tasks?directory=true` trả payload chuyên dụng cho dropdown/form. Server Component gọi thẳng `listProjectDirectory()`/`listWorkTaskDirectory()`; không còn tải toàn bộ mô tả, thống kê, trạng thái, tags, ảnh và tệp đính kèm chỉ để chọn dự án/công việc/quan hệ tiền đề.
- `GET /api/accounts` đổi sang contract danh sách phân trang, không còn trả `so_tai_khoan`, `ten_ngan_hang`, `dia_chi`, `ngay_sinh`, `ngay_nghi_viec`, `ghi_chu` hay `auth_user_id`. Màn hình bỏ các cột nhạy cảm này; xem hồ sơ/sửa tài khoản tải bản ghi detail theo id.
- Thống kê nhân sự dùng endpoint `/api/accounts/analytics` với tập field đúng nhu cầu báo cáo; danh sách phòng ban cho trang chi tiết dùng `/api/accounts/directory`.
- Xuất PDF tài khoản đọc các trang payload list tối giản theo bộ lọc, không gọi endpoint tải toàn bộ hồ sơ chi tiết.
- `api-client.ts` đặt payload budget: accounts 80 KiB, projects 100 KiB, tasks/subtasks 120 KiB, directory 60 KiB; log JSON cảnh báo khi vượt budget. Log chỉ chứa method, pathname (bỏ query), status, duration, payload bytes, request id và attempt — không chứa token/PII.

### 10.2 Phân trang tài khoản phía server

- `GET /api/accounts` nhận `search`, `departmentId`, `position`, `role`, `status`, `sort`, `direction`, `page`, `pageSize` (tối đa 100); dùng `.range()` và `count: "exact"`.
- `AccountManagementPage` debounce riêng ô tìm kiếm 300 ms; đổi trang/page size/filter/sort gọi ngay và hủy request cũ bằng `AbortController`.
- Summary toàn cục (tổng/đang hoạt động/admin/phân bổ phòng ban) được tính bằng các count query, không phụ thuộc trang hiện tại.
- Đổi trạng thái dùng `PATCH /api/accounts/[id]`, tránh gửi lại một list item đã bị lược field rồi vô tình ghi đè field detail thành null.

### 10.3 Bảo vệ race condition bổ sung

`SessionDataCache` có version theo key + epoch toàn cache. Kể cả transport/fetcher resolve sau khi `AbortController.abort()`, response cũ chỉ được trả cho promise đang chờ và không được ghi vào cache nếu version/epoch không còn khớp.

### 10.4 Đã kiểm tra

- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` — pass.
- Production build nhận đủ route mới `/api/accounts/analytics`, `/api/accounts/directory`; ba trang danh sách công việc vẫn là Dynamic (`ƒ`).
- Trình duyệt thật khi chưa đăng nhập: `/nhan-vien` và ba trang danh sách dự án/công việc/task đều redirect về `/dang-nhap`, trang đăng nhập render bình thường.
- `GET /api/accounts?page=1&pageSize=20` khi chưa đăng nhập trả `401` và có `x-request-id`.

### 10.5 Còn phụ thuộc môi trường/đầu vào bên ngoài

- Baseline HAR/Web Vitals p50/p95 trên bộ dữ liệu 200/20.000/40.000 và so sánh payload trước/sau chưa thể kết luận vì database hiện chỉ có dữ liệu dev nhỏ.
- Kiểm thử chức năng/hiệu năng đủ `admin`/`manager`/`member` vẫn cần tài khoản đăng nhập thật cho từng vai trò.
- Cursor pagination chưa triển khai đúng điều kiện của kế hoạch: chỉ làm nếu số đo dữ liệu lớn sau index vẫn chứng minh trang sâu chậm. Offset pagination hiện có `count: "exact"` và giới hạn page size.
- Instrumentation `Server-Timing auth/db/map/total`, log JSON server và Web Vitals đã có. Việc còn lại là chạy production với dữ liệu/tài khoản đại diện đủ lâu để tổng hợp percentile có ý nghĩa.

---

## 11. Rà soát phần còn thiếu ngày 02/08/2026

### 11.1 Đã làm nốt trong code

- Thêm observability dùng chung cho API: request id, `Server-Timing`, log JSON an toàn và kích thước response.
- Thêm thu thập Web Vitals theo route qua `sendBeacon`.
- Hoàn tất intent-prefetch cho tiêu đề Card và thông báo dẫn tới chi tiết task.
- Dọn các callback/router không còn dùng sau khi chuyển Card sang link thật.

### 11.2 Đã xác minh tự động

- `pnpm lint` — pass, không còn warning.
- `pnpm exec tsc --noEmit` — pass.
- `pnpm build` — pass trên Next.js 16.2.12; route `/api/observability/web-vitals` xuất hiện trong production build.
- Smoke test bằng production server riêng: Web Vitals trả `202`, `/api/accounts` chưa đăng nhập trả `401`; cả hai response đều có UUID `x-request-id`, đủ `Server-Timing auth/db/map/total`, và log JSON khớp request id. Server smoke test đã được tắt sau khi kiểm tra.
- Kiểm thử trình duyệt thật với phiên `admin` đang có trên Supabase online: trang dự án render 4 dòng, trang công việc 18 dòng, trang task 25 dòng ngay từ lần hiển thị được quan sát, không có skeleton toàn bảng; số link detail tương ứng đúng số dòng.
- Chuyển trang dự án sang dạng Card và click tiêu đề `Quản lý Công việc IT Việt Nhật` mở đúng URL chi tiết dự án; không có lỗi console.
- Reporter đã ghi được Web Vitals thật theo route. Ví dụ ở lượt smoke test đơn lẻ: trang công việc có TTFB khoảng 51,6 ms, LCP khoảng 1.024 ms, CLS 0; trang task có TTFB khoảng 130,7 ms, LCP khoảng 612 ms, CLS khoảng 0,00034. Đây chỉ là bằng chứng instrumentation hoạt động, **không phải** baseline/p50/p95 vì số mẫu quá ít.

### 11.3 Không thể tự kết luận chỉ bằng sửa code

- Baseline HAR và percentile trên bộ dữ liệu mục tiêu 200/20.000/40.000.
- Luồng đọc/render cơ bản của `admin` đã được smoke test; vẫn thiếu kiểm thử quyền và chức năng đầy đủ cho `manager`/`member`, cùng các mutation theo từng vai trò.
- Kiểm tra bàn phím, chuột giữa, `Ctrl+Click`, cache hit chính xác trong Network panel và cảm nhận chuyển trang qua nhiều lượt.
- Cursor pagination chỉ được triển khai nếu phép đo trang sâu sau khi có dữ liệu lớn chứng minh offset hiện tại không đạt mục tiêu; hiện chưa có bằng chứng để thêm độ phức tạp này.
