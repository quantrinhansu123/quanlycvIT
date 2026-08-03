# Báo cáo triển khai Giai đoạn 10 — Bundle, lazy-load & prefetch budget

Ngày triển khai: **02/08/2026**
Nguồn kế hoạch: `PERF-UNIFIED-IMPLEMENTATION-PLAN.md` (mục "Giai đoạn 10")
Báo cáo trước: `PERF-PHASE-0-1-README.md` (GĐ0→GĐ5 một phần), `PERF-PHASE-6-README.md` (GĐ6, GĐ7, GĐ9 một phần)
Trạng thái: **Audit xong — kết luận: KHÔNG cần sửa code. Đây là giai đoạn duy nhất tới nay kết thúc mà không có commit thay đổi mã nguồn, vì mọi mục tiêu của GĐ10 đã được đáp ứng sẵn từ kỷ luật kỹ thuật của các giai đoạn trước (GĐ4 dynamic-import modal, và cấu trúc gọn từ đầu dự án — không có thư viện chart/editor/crop nào từng được thêm vào).**

---

## 1. Vì sao báo cáo này không có phần "file thay đổi"

Khác với các báo cáo GĐ6/GĐ7/GĐ9, giai đoạn này **không sửa bất kỳ file mã nguồn nào**. Lý do là kết quả khảo sát, không phải bỏ qua công việc: sau khi kiểm tra kỹ từng mục trong checklist GĐ10 của kế hoạch, không phát hiện được component nào cần lazy-load thêm mà chưa được xử lý, và cách đo bundle mà kế hoạch giả định (dùng lại số liệu GĐ0) không tồn tại vì GĐ0 chưa từng đo baseline thật. Báo cáo này ghi lại đầy đủ quá trình khảo sát để không ai phải làm lại từ đầu, và để phân biệt rõ "đã kiểm tra, không có vấn đề" với "chưa kiểm tra".

---

## 2. Khảo sát trước khi kết luận

### 2.1 Dependency production — không có thư viện nặng nào cần lazy-load

`package.json` chỉ có 9 dependency production:

```
@supabase/ssr, @supabase/supabase-js, clsx, lucide-react, next, pdfmake, react, react-dom, tailwind-merge
```

Không có chart library (recharts/chart.js/d3...), không có rich-text editor (tiptap/slate/quill...), không có thư viện crop/resize ảnh (react-easy-crop/cropperjs...). Đây là bằng chứng trực tiếp, không phải suy luận từ code: kế hoạch GĐ10 dự đoán các loại "component thật sự nặng" (biểu đồ dashboard, editor...) — nhưng dự án này chưa từng thêm loại thư viện đó.

**`pdfmake`** là dependency nặng duy nhất (14MB chưa nén trên đĩa theo `du -sh node_modules/pdfmake` — con số này là kích thước gói cài đặt, không phải kích thước gửi tới trình duyệt). Đọc trực tiếp `src/lib/pdf-export.ts:56-58`:

```ts
const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
  import("pdfmake/build/pdfmake"),
  import("pdfmake/build/vfs_fonts"),
]);
```

Đây là `import()` động **ngay trong hàm `exportTablePdf()`**, không phải static import ở đầu file — nghĩa là `pdfmake` đã được tách thành chunk riêng, chỉ tải khi người dùng bấm nút "Xuất PDF", từ trước khi GĐ10 bắt đầu. Xác nhận lại bằng cách đọc `next.config.ts:30`: `optimizePackageImports: ["lucide-react", "pdfmake"]` — cấu hình tree-shaking barrel-import cho đúng 2 thư viện này đã có sẵn.

### 2.2 Xác nhận bằng chunk thật sau `next build`

Chạy `next build` rồi đọc trực tiếp `.next/server/app/(dashboard)/page/build-manifest.json` — file này liệt kê `rootMainFiles` (các chunk JS tải ngay khi vào bất kỳ route nào trong `(dashboard)`):

```json
"rootMainFiles": [
  "static/chunks/2zjueh7t2vecu.js",
  "static/chunks/0pejduu-90uue.js",
  "static/chunks/2301ige2vpk56.js",
  "static/chunks/1y7dxfyc26k29.js",
  "static/chunks/0paxexg6-m0de.js",
  "static/chunks/turbopack-1pcxy1mihheu5.js"
]
```

Grep nội dung từng chunk lớn nhất trong `.next/static/chunks/`:

| Chunk | Kích thước trên đĩa (chưa gzip) | Chứa | Có trong `rootMainFiles`? |
|---|---:|---|---|
| `21sh7bv_30vau.js` | 1.3 MB | `pdfmake` | **Không** — chunk async, chỉ tải khi xuất PDF |
| `2gv8dh6fgmr61.js` | 830 KB | chưa định danh chính xác (không có analyzer thật — xem mục 3) | **Không** |
| `0vzieynsa5yu6.js` | 250 KB | `@supabase/supabase-js` | **Không** — tải qua nhánh import động của module graph, không chặn tải trang đầu |
| `2301ige2vpk56.js` | 227 KB | `react-dom` | **Có** — không tránh được, là runtime bắt buộc của mọi app React |
| `1y7dxfyc26k29.js` | 137 KB | Header/layout + Next.js runtime | **Có** — hợp lý, đây chính là code layout dùng chung thật (Sidebar/Header/MobileMenu) |

Kết luận từ bảng trên: cả `pdfmake` và `@supabase/supabase-js` — 2 chunk lớn nhất trong toàn bộ build — đều **không** nằm trong nhóm tải ngay. Đúng yêu cầu "không đưa PDF/chart/editor vào shared layout bundle" của kế hoạch, không cần sửa gì để đạt được điều này vì nó đã đúng từ trước.

### 2.3 Đối chiếu toàn bộ modal/drawer với next/dynamic

Liệt kê 11 file `*Modal.tsx`/`*Drawer.tsx` trong `src/components/`, rồi grep từng nơi gọi (cả `import { X } from "@/components/..."` tĩnh và `dynamic(() => import(...))` động, cả đường dẫn tuyệt đối `@/...` và tương đối `./...`):

| Component | Nơi gọi | Có `next/dynamic` ở mọi nơi gọi? |
|---|---|---|
| `AccountFormModal` | `AccountManagementPage.tsx`, `EmployeeDetailPage.tsx` | ✅ |
| `DepartmentFormModal` | `DepartmentManagementPage.tsx` | ✅ |
| `FinanceCategoryModal` | `FinanceManagementPage.tsx` (đường dẫn tương đối `./FinanceCategoryModal`) | ✅ |
| `FinanceTransactionDetailModal` | `FinanceManagementPage.tsx` | ✅ |
| `FinanceTransactionModal` | `FinanceManagementPage.tsx` | ✅ |
| `ProjectFormModal` | `ProjectListClient.tsx`, `ProjectDetailView.tsx` | ✅ |
| `SubtaskFormModal` | `SubtaskListClient.tsx`, `SubtaskDetailView.tsx`, `WorkTaskSubtasksPanel.tsx` | ✅ |
| `SubtaskQuickViewModal` | `SubtaskListClient.tsx`, `WorkTaskSubtasksPanel.tsx` | ✅ |
| `TaskFormModal` | `TaskListClient.tsx`, `TaskDetailView.tsx`, `ProjectTasksPanel.tsx` | ✅ |
| `TaskReportDrawer` | `SubtaskListClient.tsx`, `SubtaskDetailView.tsx`, `WorkTaskSubtasksPanel.tsx` | ✅ |
| `TaskQuickViewModal` | **Không có nơi gọi nào** | Xem mục 2.4 |

Không có nơi nào import tĩnh một modal/drawer mà đúng ra phải dynamic. Điều này khớp với những gì `PERF-PHASE-0-1-README.md` (GĐ4) đã ghi: "Giữ `next/dynamic` cho modal/drawer... đã áp dụng cho form dự án/công việc/task/tài khoản/phòng ban/thu-chi/report drawer" — công việc này thực chất đã làm xong từ GĐ4, GĐ10 chỉ xác nhận lại không có sót.

**Một trường hợp lồng nhau đáng ghi chú:** `SubtaskQuickViewModal.tsx:22` import tĩnh `TaskReportDrawer` (`import { TaskReportDrawer } from "@/components/tasks/TaskReportDrawer"`). Đây **không phải lỗi** — vì `SubtaskQuickViewModal` bản thân nó luôn được gọi qua `next/dynamic` ở mọi nơi dùng, nên `TaskReportDrawer` import tĩnh bên trong nó vẫn nằm trong đúng 1 chunk async, chỉ tải khi `SubtaskQuickViewModal` được mở — không có gì tải sớm hơn cần thiết.

### 2.4 Phát hiện phụ: `TaskQuickViewModal.tsx` là dead code

Grep `TaskQuickViewModal` trên toàn bộ `src/` (cả `.ts` và `.tsx`) chỉ tìm thấy tham chiếu trong chính file định nghĩa nó — **không có nơi nào import** component này. Vì Turbopack chỉ đưa vào bundle những module được tham chiếu từ đồ thị import thực tế, một component không được import ở đâu **không nằm trong bundle nào cả** — ảnh hưởng tới kích thước bundle bằng 0. Đây thuần túy là một phát hiện dọn dẹp code (dead code), không phải vấn đề hiệu năng — **cố tình không xóa** vì nằm ngoài phạm vi một đợt sửa hiệu năng (có thể đây là component đang được giữ lại cho việc dùng trong tương lai gần, không đủ dữ kiện để khẳng định). Ghi nhận lại để bạn tự quyết định có xóa hay không.

### 2.5 `PerformanceDashboard.tsx` và `ImagePreviewDialog.tsx` — quá nhẹ để tách thêm

Kế hoạch gợi ý xem xét lazy-load "biểu đồ dashboard nặng" và "trình xem ảnh/tệp". Đọc trực tiếp:

- `PerformanceDashboard.tsx` (1097 dòng): import chỉ gồm `lucide-react` (icon, đã tree-shake), `next/navigation`, và các service/type nội bộ — không có thư viện vẽ biểu đồ nào. Toàn bộ phần "biểu đồ" trong UI là SVG/CSS tự viết (vd. `<div style={{ width: ... }}>` cho progress bar), không phải canvas/SVG-heavy chart library. 1097 dòng là độ dài mã nguồn, không đồng nghĩa với JS runtime nặng.
- `ImagePreviewDialog.tsx` (63 dòng): 1 thẻ `<img>` + nút đóng + phím Escape — không có thư viện lightbox/zoom nào.

Tách 1 trong 2 component này ra `next/dynamic` sẽ chỉ thêm 1 network round-trip (chờ tải chunk) mà không giảm được byte nào đáng kể — đi ngược nguyên tắc "không dynamic-import tràn lan" mà kế hoạch tự đặt ra ở dòng đầu tiên của GĐ10.

### 2.6 Module "chỉ dành admin" — đã tách theo route từ kiến trúc Next.js App Router, không cần thêm gì

`AccountManagementPage`, `DepartmentManagementPage`, trang `/nhan-vien/phan-quyen`... đều là nội dung của các `page.tsx` riêng biệt dưới App Router. Next.js tự tách JS theo route (mỗi `page.tsx` là 1 entry/chunk riêng khi điều hướng) — một tài khoản `member` không bao giờ vào các route này thì không bao giờ tải JS của chúng, **không cần** bọc thêm `next/dynamic` để đạt hiệu quả tương đương. Đây là điểm khác biệt quan trọng với modal/drawer (vốn nằm *bên trong* một route mà mọi vai trò đều vào được, nên cần dynamic-import để tách riêng theo *hành động mở modal* chứ không theo route).

---

## 3. Vì sao không cài `@next/bundle-analyzer` — đọc docs trước khi dùng, không đoán

Theo đúng yêu cầu bắt buộc trong `AGENTS.md` ("đọc tài liệu Next.js tương ứng trong `node_modules/next/dist/docs/` trước khi dùng API Next mới"), đã đọc `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md` trước khi định cài `@next/bundle-analyzer` — công cụ chuẩn cho GĐ10 trong các dự án Next.js dùng webpack.

Mục "Known gaps with webpack" của tài liệu ghi rõ:

> **Webpack plugins**: Turbopack does not support webpack plugins.
> **`webpack()` configuration** in `next.config.js`: Turbopack replaces webpack, so `webpack()` configs are not recognized.

`@next/bundle-analyzer` hoạt động bằng cách đăng ký một webpack plugin trong hàm `webpack()` của `next.config.js` — cơ chế này **không được Turbopack nhận diện**. Dự án này build bằng `next build` không có cờ `--webpack` → mặc định dùng Turbopack (xác nhận qua output thật: `▲ Next.js 16.2.12 (Turbopack)`). Cài `@next/bundle-analyzer` vào dự án này sẽ là một dependency không hoạt động — **quyết định không cài**, tránh lặp lại sai lầm "sao chép nguyên trạng dự án tham chiếu" mà `AGENTS.md` cảnh báo.

Tài liệu cũng xác nhận không có công cụ phân tích thành phần bundle nào chính thức cho Turbopack ở phiên bản Next.js 16.2.12 — chỉ có `NEXT_TURBOPACK_TRACING=1` để tạo trace file gỡ lỗi hiệu năng *build*, không phải để xem "chunk nào chứa thư viện gì". Số liệu ở mục 2.2 (đọc trực tiếp `.next/static/chunks` + grep tên thư viện) là cách thay thế thủ công duy nhất tìm được, và **không chính xác bằng công cụ phân tích thật** — không nên coi là số đo chính thức, chỉ dùng để xác nhận không có gì bất thường rõ rệt.

---

## 4. Kết luận theo từng điều kiện hoàn thành của kế hoạch

| Điều kiện hoàn thành (theo kế hoạch) | Kết quả |
|---|---|
| Mở route không tải JS của modal/export chưa dùng | **Đạt** — xác nhận qua `build-manifest.json`, `pdfmake`/`@supabase` không trong `rootMainFiles` |
| Không có chunk bất thường | **Đạt theo kiểm tra thủ công** — không thấy thư viện lạ trong các chunk lớn; **chưa đạt theo nghĩa "đo bằng công cụ thật"** vì không có analyzer tương thích Turbopack (mục 3) |
| Điều hướng warm đạt chỉ tiêu mà không tăng prefetch thừa | **Không đổi gì** ở GĐ10 nên không có rủi ro mới; hành vi prefetch vẫn nguyên như GĐ4 |

---

## 5. Tiếp theo (chưa làm)

- **Đo lại GĐ0 thật bằng trình duyệt** — vẫn là khoảng trống lớn nhất xuyên suốt mọi giai đoạn từ đầu tới giờ. Khi có số đo thật (Chrome DevTools → Network/Coverage tab trên `next build && next start`), mới có thể xác nhận chắc chắn "không có chunk bất thường" bằng số liệu thay vì suy luận từ tên biến/grep thủ công như báo cáo này.
- **`TaskQuickViewModal.tsx`** — quyết định xóa hay giữ (mục 2.4), không thuộc phạm vi hiệu năng nên để bạn tự quyết.
- ~~**Giai đoạn 8** (Batch API & kiểm soát đồng thời upload)~~ — **đã hoàn tất về mặt code trong đợt rà soát 02/08/2026**, xem `PERF-PHASE-6-README.md` mục 8.
- **Giai đoạn 9 phần RPC transaction** — chưa làm, xem `PERF-PHASE-6-README.md` mục 7.4.
- **Giai đoạn 11** (Quan sát, cảnh báo & rollout) — chưa làm, là giai đoạn liên tục nên có thể bắt đầu sớm (duy trì `x-request-id` đã có từ GĐ0, thêm Web Vitals thu thập thật).
