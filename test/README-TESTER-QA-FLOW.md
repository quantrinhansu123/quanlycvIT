# Kịch bản kiểm thử luồng QA Task con

## 1. Mục tiêu

Xác nhận luồng xử lý Task con hoạt động đúng theo chuỗi:

```text
Cần làm
→ Đang làm
→ Chờ test
→ Fail: Đang làm 99%
→ Chờ test
→ Pass: Chờ duyệt
→ Admin duyệt
→ Đã hoàn thành
```

Phạm vi kiểm thử chỉ áp dụng cho **Task con** (`task`), không áp dụng cho Công việc cha (`cong_viec`).

## 2. Điều kiện chuẩn bị

Chuẩn bị ba tài khoản đang hoạt động:

| Ký hiệu | Vai trò trong kịch bản | Yêu cầu |
|---|---|---|
| A | Người thực hiện | Được phân công vào Task |
| B | Người test | Được chọn tại trường Người test |
| C | Người duyệt | Có role `admin` |

Khuyến nghị đăng nhập đồng thời bằng ba phiên trình duyệt khác nhau:

- Cửa sổ trình duyệt thông thường.
- Cửa sổ ẩn danh.
- Trình duyệt khác hoặc profile trình duyệt khác.

Trước khi bắt đầu:

- [ ] Migration `20260812000100_subtask_tester_qa_flow.sql` đã được áp dụng.
- [ ] Ứng dụng khởi động và đăng nhập bình thường.
- [ ] Ba tài khoản A, B, C đều có trạng thái hoạt động.
- [ ] Có một Công việc cha mà tài khoản A có thể được giao Task.

## 3. Kịch bản chính: Fail rồi Pass

### TC-01 — Tạo Task và gán tester

**Tài khoản thực hiện:** tài khoản có quyền tạo Task.

Các bước:

1. Vào **Quản lý công việc → Danh sách Task**.
2. Chọn **Thêm mới**.
3. Nhập đầy đủ thông tin bắt buộc.
4. Chọn tài khoản A tại **Người thực hiện**.
5. Chọn tài khoản B tại **Người test**.
6. Lưu Task.
7. Mở lại form chỉnh sửa Task.

Kết quả mong đợi:

- [ ] Task được tạo thành công.
- [ ] Trạng thái ban đầu là **Cần làm**.
- [ ] Tiến độ ban đầu là 0%.
- [ ] Form chỉnh sửa hiển thị đúng tài khoản A và B.
- [ ] Không xuất hiện thông báo lỗi Supabase hoặc lỗi quan hệ schema.

### TC-02 — Người thực hiện xác nhận nhận Task

**Tài khoản thực hiện:** A.

Các bước:

1. Mở Task vừa tạo.
2. Chọn **Xác nhận nhận Task**.

Kết quả mong đợi:

- [ ] Task chuyển sang **Đang làm**.
- [ ] Tiến độ nằm trong khoảng 1–99%.
- [ ] Thao tác xác nhận không còn xuất hiện sau khi đã xác nhận.

### TC-03 — Báo cáo tiến độ dưới 100%

**Tài khoản thực hiện:** A.

Các bước:

1. Mở **Báo cáo tiến độ**.
2. Chọn tiến độ 50%.
3. Nhập nội dung báo cáo.
4. Gửi báo cáo.

Kết quả mong đợi:

- [ ] Báo cáo được lưu trong lịch sử.
- [ ] Task vẫn ở trạng thái **Đang làm**.
- [ ] Tiến độ Task là 50%.
- [ ] Tài khoản B chưa nhận thông báo cần test.

### TC-04 — Gửi Task cho tester

**Tài khoản thực hiện:** A.

Các bước:

1. Mở **Báo cáo tiến độ**.
2. Kéo tiến độ lên 100%.
3. Kiểm tra trường **Người test**.
4. Nhập nội dung báo cáo.
5. Chọn **Gửi cho Tester [tên tài khoản B]**.

Kết quả mong đợi:

- [ ] Người test B được chọn sẵn nếu đã gán trong form Task.
- [ ] Task chuyển sang **Chờ test**.
- [ ] Tiến độ Task là 100%.
- [ ] Tài khoản B nhận thông báo **Bạn có Task cần test**.
- [ ] Người thực hiện không thể gửi thêm báo cáo khi Task đang Chờ test.
- [ ] Admin chưa thể duyệt Task tại bước này.

### TC-05 — Tester xem danh sách cần test

**Tài khoản thực hiện:** B.

Các bước:

1. Vào **Quản lý công việc → Danh sách Task**.
2. Bật bộ lọc **Cần tôi test**.
3. Mở Task vừa được gửi.

Kết quả mong đợi:

- [ ] Task xuất hiện trong danh sách.
- [ ] Task có trạng thái **Chờ test** và tiến độ 100%.
- [ ] Tester thấy thao tác **Pass kiểm thử** và **Fail kiểm thử**.
- [ ] Tester xem được nội dung và lịch sử báo cáo.
- [ ] Tester không thể chỉnh sửa Task.
- [ ] Tester không thể báo cáo tiến độ thay người thực hiện.

### TC-06 — Tester báo Fail

**Tài khoản thực hiện:** B.

Các bước:

1. Chọn **Fail kiểm thử**.
2. Nhập lý do: `Nút lưu chưa hoạt động khi để trống mô tả`.
3. Xác nhận kết quả.

Kết quả mong đợi:

- [ ] Task chuyển về **Đang làm**.
- [ ] Tiến độ Task tự động về 99%.
- [ ] Lý do Fail được lưu.
- [ ] Task biến mất khỏi bộ lọc **Cần tôi test** của B.
- [ ] Tài khoản A nhận thông báo **Task chưa đạt kiểm thử**.
- [ ] Nội dung thông báo chứa lý do Fail.

### TC-07 — Không cho phép Fail khi thiếu lý do

**Tài khoản thực hiện:** B trên một Task khác đang Chờ test.

Các bước:

1. Chọn **Fail kiểm thử**.
2. Không nhập nội dung hoặc chỉ nhập khoảng trắng.
3. Đóng hộp thoại hoặc thử xác nhận.

Kết quả mong đợi:

- [ ] Task không thay đổi trạng thái.
- [ ] Tiến độ vẫn là 100%.
- [ ] Không tạo thông báo test thất bại.
- [ ] API từ chối dữ liệu nếu gửi trực tiếp mà không có lý do.

### TC-08 — Người thực hiện gửi lại sau khi sửa

**Tài khoản thực hiện:** A.

Các bước:

1. Mở thông báo test thất bại.
2. Mở Task và kiểm tra tiến độ.
3. Sửa lỗi theo ghi chú của tester.
4. Tạo báo cáo mới với tiến độ 100%.
5. Gửi lại cho tài khoản B.

Kết quả mong đợi:

- [ ] Trước khi gửi lại, Task ở **Đang làm**, tiến độ 99%.
- [ ] Sau khi gửi lại, Task chuyển sang **Chờ test**, tiến độ 100%.
- [ ] Tài khoản B nhận thông báo cần test mới.
- [ ] Task xuất hiện lại trong bộ lọc **Cần tôi test**.

### TC-09 — Tester báo Pass

**Tài khoản thực hiện:** B.

Các bước:

1. Mở Task đang Chờ test.
2. Chọn **Pass kiểm thử**.

Kết quả mong đợi:

- [ ] Task chuyển sang **Chờ duyệt**.
- [ ] Tiến độ vẫn là 100%.
- [ ] Task biến mất khỏi bộ lọc **Cần tôi test**.
- [ ] Không còn thao tác Pass hoặc Fail.
- [ ] Người thực hiện không thể báo cáo thêm.

### TC-10 — Admin duyệt hoàn thành

**Tài khoản thực hiện:** C.

Các bước:

1. Mở Task đang Chờ duyệt.
2. Chọn **Duyệt Task**.

Kết quả mong đợi:

- [ ] Task chuyển sang **Đã hoàn thành**.
- [ ] Tiến độ là 100%.
- [ ] Không còn thao tác báo cáo, Pass hoặc Fail.
- [ ] Công việc cha chỉ hoàn thành khi toàn bộ Task con đã được duyệt hoàn thành.

## 4. Kiểm thử chọn tester tại thời điểm báo cáo

### TC-11 — Task chưa được gán tester từ trước

Các bước:

1. Tạo một Task và để trống **Người test**.
2. Tài khoản A xác nhận nhận Task.
3. Mở báo cáo và chọn tiến độ 100%.

Kết quả mong đợi:

- [ ] Trường **Người test** xuất hiện.
- [ ] Nút gửi bị vô hiệu hóa khi chưa chọn tester.
- [ ] Sau khi chọn B, nút đổi thành **Gửi cho Tester B**.
- [ ] Gửi thành công và Task chuyển sang Chờ test.
- [ ] Tester được lưu lại trên Task.

## 5. Kiểm thử phân quyền

### TC-12 — Người không được gán test

1. Đăng nhập bằng một tài khoản D không phải tester và không phải admin.
2. Thử mở trực tiếp URL của Task đang Chờ test.
3. Nếu có thể xem Task theo quan hệ phân công khác, kiểm tra menu thao tác.

Kết quả mong đợi:

- [ ] Không có thao tác Pass/Fail nếu D không phải tester được gán.
- [ ] Gọi trực tiếp API test-result bằng D trả về HTTP 403.

### TC-13 — Admin xử lý thay tester

1. Đăng nhập tài khoản C.
2. Mở Task đang Chờ test.
3. Thử Pass hoặc Fail.

Kết quả mong đợi:

- [ ] Admin có thể Pass hoặc Fail thay tester.
- [ ] Khi Fail, lý do vẫn bắt buộc và Task trở về 99%.

### TC-14 — Không duyệt trước khi Pass

1. Dùng tài khoản C mở Task đang Chờ test.
2. Tìm thao tác duyệt hoàn thành.
3. Nếu gọi trực tiếp API approve, ghi nhận phản hồi.

Kết quả mong đợi:

- [ ] Không hiển thị thao tác **Duyệt Task** ở trạng thái Chờ test.
- [ ] API approve từ chối vì Task chưa ở trạng thái Chờ duyệt.

### TC-15 — Chống xử lý trùng

1. Mở cùng một Task Chờ test trong hai tab của tài khoản B.
2. Tab thứ nhất chọn Pass.
3. Tab thứ hai thử chọn Fail.

Kết quả mong đợi:

- [ ] Lần xử lý đầu tiên thành công.
- [ ] Lần xử lý thứ hai bị từ chối vì trạng thái đã thay đổi.
- [ ] Task không bị ghi đè ngược trạng thái.

## 6. Kiểm thử thông báo

| Sự kiện | Người nhận | Nội dung mong đợi |
|---|---|---|
| Task chuyển sang Chờ test | Tester được gán | Bạn có Task cần test |
| Tester Fail | Người phụ trách chính | Task chưa đạt kiểm thử và lý do lỗi |
| Gửi lại Task sau Fail | Tester được gán | Thông báo cần test mới |

Checklist:

- [ ] Chuông thông báo cập nhật sau thao tác mà không cần đăng nhập lại.
- [ ] Mỗi lần Task đi vào Chờ test tạo đúng một thông báo.
- [ ] Fail tạo đúng một thông báo cho người thực hiện.
- [ ] Nội dung thông báo mở đúng Task.
- [ ] Đánh dấu đã đọc hoạt động bình thường với loại thông báo mới.

## 7. Kiểm thử dữ liệu và giao diện

- [ ] Badge **Chờ test** có màu violet, khác Chờ duyệt và Hoàn thành.
- [ ] Bộ lọc trạng thái có lựa chọn **Chờ test**.
- [ ] PDF xuất danh sách hiển thị đúng nhãn Chờ test.
- [ ] Timeline ghi nhận Chờ test, Pass và Fail với nhãn phù hợp.
- [ ] Tải lại trang không làm mất tester đã gán.
- [ ] Task Chờ test/Chờ duyệt vẫn được tính là chưa hoàn thành trong Công việc cha.
- [ ] Không có thay đổi trạng thái hoặc trường tester trên form Công việc cha.

## 8. Mẫu ghi nhận kết quả

| Test case | Kết quả | Người test | Ngày test | Ghi chú/Bằng chứng |
|---|---|---|---|---|
| TC-01 | ☐ Pass ☐ Fail | | | |
| TC-02 | ☐ Pass ☐ Fail | | | |
| TC-03 | ☐ Pass ☐ Fail | | | |
| TC-04 | ☐ Pass ☐ Fail | | | |
| TC-05 | ☐ Pass ☐ Fail | | | |
| TC-06 | ☐ Pass ☐ Fail | | | |
| TC-07 | ☐ Pass ☐ Fail | | | |
| TC-08 | ☐ Pass ☐ Fail | | | |
| TC-09 | ☐ Pass ☐ Fail | | | |
| TC-10 | ☐ Pass ☐ Fail | | | |
| TC-11 | ☐ Pass ☐ Fail | | | |
| TC-12 | ☐ Pass ☐ Fail | | | |
| TC-13 | ☐ Pass ☐ Fail | | | |
| TC-14 | ☐ Pass ☐ Fail | | | |
| TC-15 | ☐ Pass ☐ Fail | | | |

## 9. Tiêu chí nghiệm thu

Chức năng đạt yêu cầu khi:

- TC-01 đến TC-10 đều Pass.
- TC-12 đến TC-15 không có lỗi phân quyền hoặc ghi đè trạng thái.
- Không xuất hiện lỗi HTTP 500, lỗi `PGRST200`, lỗi constraint hoặc lỗi schema cache.
- TypeScript, ESLint và production build vẫn chạy thành công.

