# Kiểm thử hiệu năng với dữ liệu lớn

Ngày kiểm thử: **01/08/2026**

## Kết luận nhanh

- Không phát hiện lỗi HTTP, lỗi lưu dữ liệu, mất dữ liệu hoặc lỗi console khi chạy với **200 dự án, 20.000 công việc và 40.000 task con**.
- Phân trang đang hoạt động đúng: payload trang đầu giữ ở khoảng 37–44KB, không tăng theo tổng số bản ghi.
- Tải trang đầu và lưu dữ liệu vẫn nhanh. Điểm chậm rõ nhất là **tìm kiếm chứa chuỗi** và **mở trang rất sâu**.
- Nguyên nhân đã xác nhận bằng `EXPLAIN (ANALYZE, BUFFERS)`: PostgreSQL đang `Seq Scan` và sort toàn bộ bảng do thiếu index `created_at` và thiếu trigram index cho `ILIKE '%...%'`.
- Toàn bộ dữ liệu test đã được xóa sau phép đo. Production không bị truy cập hoặc thay đổi.

## Phạm vi và dữ liệu thử

Môi trường:

- Next.js 16.2.12 local.
- Supabase/PostgreSQL chạy trong Docker local tại `127.0.0.1`.
- Đo API bằng JWT của tài khoản admin local.
- Đo bản development ở cổng `3002` và bản production ở cổng tạm `3003`.
- Mỗi phép đo tuần tự chạy 5 lần sau một request làm nóng; bảng kết quả dùng trung vị.

Dữ liệu tạm:

| Loại | Số lượng |
|---|---:|
| Dự án | 200 |
| Công việc | 20.000 |
| Task con | 40.000 |
| Tổng bản ghi nghiệp vụ test | 60.200 |

Mọi dự án dùng mã `PERF-LARGE-*`. Xóa dự án sẽ cascade đúng sang công việc và task con.

## Kết quả API production

### Một người dùng, request tuần tự

| API | Trung vị | Kích thước/trả về |
|---|---:|---:|
| Trang 1 dự án, 50 dòng | 112 ms | 43,8KB; tổng 200 |
| Trang 1 công việc, 50 dòng | 50 ms | 36,9KB; tổng 20.000 |
| Trang 1 task con, 50 dòng | 53,8 ms | 37,9KB; tổng 40.000 |
| Tìm công việc `PERF-LARGE` | 238,5 ms | 50/20.000 dòng |
| Tìm task con `PERF-LARGE` | 265 ms | 50/40.000 dòng |
| Trang cuối công việc (trang 400) | 251,8 ms | 50 dòng |
| Trang cuối task con (trang 800) | 175,6 ms | 50 dòng |

### Hai mươi request đồng thời

| Tình huống | Trung vị/request | Tổng thời gian batch | Lớn nhất |
|---|---:|---:|---:|
| Trang 1 công việc | 269,3 ms | 309 ms | 305 ms |
| Tìm công việc | 1.094,4 ms | 1.194 ms | 1.188 ms |

Trong development, 20 request đồng thời cho task con cho kết quả:

- Trang thường: trung vị 562 ms.
- Tìm kiếm: trung vị 1.510,1 ms.
- Không request nào trả lỗi.

## Kết quả lưu dữ liệu

Khi DB đang chứa 60.200 bản ghi test, tạo và xóa 5 công việc tạm qua API thật:

| Thao tác | Các mẫu | Trung vị |
|---|---|---:|
| Tạo công việc | 120,7 / 64,3 / 58,9 / 64,5 / 60,9 ms | 64,3 ms |
| Xóa công việc | 61,8 / 35,1 / 32,1 / 47,4 / 30,9 ms | 35,1 ms |

Lần gọi route xóa đầu tiên từng mất 846,2 ms do cold compile/warm-up của Next development. Các lần sau ổn định ở 30,9–61,8 ms nên đây không phải độ trễ DB thường xuyên.

## Kết quả khi CPU chịu tải

Với ba worker tạo tải CPU trong 12 giây, trên bản production và DB lớn:

| API | Trung vị bình thường | Trung vị khi CPU chịu tải |
|---|---:|---:|
| Trang 1 công việc | 50 ms | 50,9 ms |
| Tìm công việc | 238,5 ms | 365,9 ms |

Phân trang chịu tải tốt. Tìm kiếm nhạy với CPU vì phải quét nhiều dòng.

## Kiểm tra giao diện

Dashboard hiển thị đúng cảnh báo giới hạn và chỉ phân tích 100 dự án/200 công việc:

- Ba lần reload development: 767 / 694 / 768 ms; trung vị 767 ms.
- 705 DOM elements, 117 `<option>`, 33 SVG.
- Không có warning/error console.
- Biểu đồ, KPI và bộ lọc đều render được với dữ liệu lớn.

Giới hạn 100/200 đang bảo vệ dashboard khỏi hydrate toàn bộ 20.000 công việc.

## Nguyên nhân điểm chậm

### 1. Tìm kiếm dùng wildcard ở đầu chuỗi

`src/lib/supabase/data.ts` dùng:

```ts
query.ilike("ten_cv", `%${search}%`)
query.ilike("ten_task", `%${search}%`)
```

B-tree thông thường không phục vụ được mẫu `%từ khóa%`. DB local chưa bật extension `pg_trgm`, vì vậy PostgreSQL quét toàn bộ 20.000/40.000 dòng.

Kết quả SQL đo trực tiếp:

- Công việc tìm kiếm: `Seq Scan`, khoảng 21,2 ms chỉ cho phần SQL cơ bản.
- Task con tìm kiếm: `Seq Scan`, khoảng 44,3 ms chỉ cho phần SQL cơ bản.
- Phần còn lại của 238–265 ms là PostgREST, exact count, hydrate quan hệ và truyền JSON.

### 2. Thiếu index theo thứ tự phân trang

Các query đều sort `created_at DESC`, nhưng `cong_viec` và `task` chưa có index `created_at`:

- Trang đầu công việc: scan 20.000 dòng rồi top-N sort.
- Trang đầu task con: scan 40.000 dòng rồi top-N sort.
- Trang cuối phải sort toàn bộ rồi bỏ qua 19.950/39.950 dòng.

### 3. Offset pagination chậm dần ở trang sâu

API dùng `.range(from, to)`, tương đương `OFFSET/LIMIT`. Cách này đúng chức năng nhưng chi phí tăng theo số trang. Trang 400/800 đã chậm hơn trang đầu khoảng 3–5 lần.

## Hướng tối ưu đề xuất

Ưu tiên 1 — thêm index tìm kiếm và sắp xếp bằng migration:

```sql
create extension if not exists pg_trgm;

create index if not exists cong_viec_ten_cv_trgm_idx
  on public.cong_viec using gin (ten_cv gin_trgm_ops);

create index if not exists task_ten_task_trgm_idx
  on public.task using gin (ten_task gin_trgm_ops);

create index if not exists cong_viec_created_at_idx
  on public.cong_viec (created_at desc, id desc);

create index if not exists task_created_at_idx
  on public.task (created_at desc, id desc);
```

Lưu ý: từ khóa khớp gần như toàn bộ bảng vẫn có thể khiến planner chọn sequential scan; trigram index có lợi nhất với từ khóa có tính chọn lọc.

Ưu tiên 2 — với danh sách có hàng trăm trang, chuyển từ offset pagination sang cursor/keyset pagination theo `(created_at, id)`.

Ưu tiên 3 — debounce ô tìm kiếm khoảng 300–400 ms và hủy request cũ khi người dùng tiếp tục gõ, tránh nhiều query `%term%` chạy đồng thời.

Ưu tiên 4 — sau khi thêm index, seed lại cùng bộ dữ liệu và so sánh lại `EXPLAIN`, median tuần tự, 20 request đồng thời và trang cuối.

## Trạng thái dọn dữ liệu

Sau kiểm thử:

| Nhóm dữ liệu | Còn lại |
|---|---:|
| Dự án `PERF-LARGE-*` | 0 |
| Công việc thuộc dự án test | 0 |
| Task con thuộc dự án test | 0 |
| Công việc probe `[PERF-LARGE-SAVE]*` | 0 |

Server production tạm ở cổng `3003` đã dừng. Server development ở cổng `3002` và Supabase Docker local được giữ nguyên.
