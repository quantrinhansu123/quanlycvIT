# Lỗi danh sách bị kẹt Skeleton sau khi rời màn hình

## 1. Hiện tượng

Tại các trang danh sách Dự án, Công việc hoặc Task:

1. Người dùng mở trang và dữ liệu hiển thị bình thường.
2. Người dùng chuyển sang tab/cửa sổ khác hoặc thu nhỏ trình duyệt.
3. Khi quay lại ứng dụng, dữ liệu biến mất và giao diện chỉ còn skeleton loading.
4. Skeleton có thể hiển thị vô thời hạn; không chuyển sang dữ liệu hoặc trạng thái lỗi.

Ảnh chụp lỗi cho thấy phần khung trang, thanh lọc và menu vẫn hoạt động, nhưng vùng danh sách bị mắc ở trạng thái `loading`.

## 2. Kết luận nguyên nhân

Lỗi không bắt nguồn từ API danh sách bị chậm. Chuỗi nguyên nhân nằm ở sự kết hợp giữa sự kiện xác thực Supabase, việc xóa cache phiên và state machine của `useSessionQuery`.

### 2.1 Supabase có thể phát lại `SIGNED_IN`

Khi tab được kích hoạt trở lại, Supabase có thể xác nhận hoặc tái thiết lập phiên hiện tại và phát sự kiện `SIGNED_IN`, kể cả khi người dùng vẫn đang đăng nhập bằng cùng một tài khoản.

Vì vậy, không được coi mọi sự kiện `SIGNED_IN` là một lần đăng nhập tài khoản mới.

Tài liệu tham khảo:

- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- https://supabase.com/docs/reference/swift/auth-onauthstatechange

### 2.2 Ứng dụng xóa toàn bộ cache khi nhận `SIGNED_IN`

Trong `src/components/providers/SessionDataCacheProvider.tsx`, callback xác thực hiện xử lý:

```ts
if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
  cache.clear();
  clearAllFormDrafts();
}
```

Điều này có nghĩa là khi Supabase phát lại `SIGNED_IN` cho cùng một người dùng, ứng dụng vẫn:

- Xóa toàn bộ dữ liệu cache của phiên.
- Hủy các request cache đang chạy.
- Xóa các bản nháp form trên thiết bị.
- Thông báo cho các component đang subscribe render lại.

Ý định ban đầu của đoạn code là chống rò dữ liệu khi đăng xuất hoặc đổi tài khoản, nhưng điều kiện `SIGNED_IN` đang rộng hơn nhu cầu thực tế.

### 2.3 `cache.clear()` làm dữ liệu của danh sách trở thành `undefined`

Trong `src/lib/client-cache/session-data-cache.ts`, `clear()` thực hiện:

```ts
this.epoch++;
for (const pendingEntry of this.pending.values()) pendingEntry.controller.abort();
this.pending.clear();
this.entries.clear();
this.versions.clear();
this.prefetchQueue = [];
for (const key of Array.from(this.listeners.keys())) this.notify(key);
```

Sau khi cache bị xóa, subscription buộc các component render lại. `useSessionQuery` đọc cache nhưng không còn entry, vì vậy `data` trở thành `undefined`.

### 2.4 `useSessionQuery` chuyển sang loading nhưng không fetch lại

Trong `src/hooks/useSessionQuery.ts`, trạng thái được tính như sau:

```ts
const status: SessionQueryStatus =
  data !== undefined ? "success" : error ? "error" : "loading";
```

Khi cache bị xóa:

- `data === undefined`.
- `error` vẫn chưa có.
- Hook trả về `status = "loading"`.
- Trang danh sách hiển thị skeleton.

Tuy nhiên, effect chịu trách nhiệm fetch dữ liệu chỉ phụ thuộc vào:

```ts
[cache, key, ttl.freshMs, ttl.staleMs, revalidateTick]
```

Subscription của cache chỉ gọi `forceRender`. Nó không thay đổi `key`, TTL hoặc `revalidateTick`, nên effect tải dữ liệu không được chạy lại sau `cache.clear()`.

Kết quả cuối cùng:

```text
Tab được kích hoạt lại
  -> Supabase phát SIGNED_IN cho phiên hiện tại
  -> SessionDataCacheProvider gọi cache.clear()
  -> Cache xóa dữ liệu và notify component
  -> useSessionQuery render lại với data = undefined
  -> status chuyển thành loading
  -> Effect fetch không chạy lại
  -> Skeleton hiển thị vô thời hạn
```

## 3. Phạm vi ảnh hưởng

Lỗi không chỉ giới hạn ở danh sách Task. Mọi màn hình sử dụng chung `useSessionQuery` và `SessionDataCache` đều có thể gặp lỗi, bao gồm:

- Danh sách Dự án.
- Danh sách Công việc.
- Danh sách Task.
- Dashboard hiệu suất.
- Các danh mục/directory được tải qua session cache.

## 4. Hướng khắc phục đề xuất

Nên sửa theo hai lớp để vừa xử lý nguyên nhân trực tiếp, vừa giúp cache tự phục hồi trong mọi trường hợp invalidation.

### 4.1 Chỉ xóa cache khi thực sự đăng xuất hoặc đổi tài khoản

`SessionDataCacheProvider` cần lưu `session.user.id` hiện tại và xử lý sự kiện theo quy tắc:

- `INITIAL_SESSION`: ghi nhận user ID ban đầu, không xóa cache.
- `SIGNED_IN` với cùng user ID: không xóa cache và không xóa bản nháp.
- `SIGNED_IN` với user ID khác: xóa cache vì đã thực sự đổi tài khoản.
- `SIGNED_OUT`: luôn xóa cache và bản nháp.

Không nên dựa riêng vào tên sự kiện `SIGNED_IN` để kết luận rằng tài khoản đã thay đổi.

### 4.2 Làm `useSessionQuery` fetch lại khi cache bị xóa/invalidate

Subscription của cache cần tăng một revision/tick, ví dụ `cacheRevision`. Giá trị này phải nằm trong dependency của effect fetch.

Luồng mong muốn:

```text
cache.clear()/cache.invalidate()
  -> subscription tăng cacheRevision
  -> hook render lại
  -> effect chạy lại
  -> phát hiện cache miss
  -> gọi fetcher
  -> cache.set()
  -> hiển thị dữ liệu mới
```

Việc sửa lớp này là cần thiết vì cache vẫn có thể bị xóa hợp lệ khi:

- Người dùng đăng xuất.
- Người dùng đổi tài khoản.
- Mutation invalidate danh sách.
- Entry hết TTL.
- Request đang chạy bị hủy.

### 4.3 Lớp phục hồi bổ sung khi tab hoạt động lại

Có thể bổ sung listener `visibilitychange` hoặc `pageshow`:

- Khi trang chuyển về `visible`, nếu không có dữ liệu và không có request pending thì gọi `refresh()`.
- Không refresh nếu cache vẫn còn fresh.

Đây chỉ là lớp dự phòng, không thay thế hai bản sửa chính ở trên.

## 5. Tiêu chí nghiệm thu

Sau khi triển khai, cần kiểm tra tối thiểu:

1. Mở danh sách Task, chuyển sang tab khác rồi quay lại: dữ liệu vẫn còn hoặc tự tải lại, không kẹt skeleton.
2. Thu nhỏ trình duyệt rồi mở lại: danh sách hoạt động bình thường.
3. Chờ token tự refresh: cache không bị xóa nếu vẫn là cùng tài khoản.
4. Điều hướng sang trang khác rồi quay lại: cache fresh hiển thị ngay; cache miss tự fetch.
5. Đăng xuất: cache và bản nháp được xóa.
6. Đăng nhập bằng tài khoản khác trên cùng tab: dữ liệu tài khoản trước không được giữ lại.
7. Hủy một request đang tải rồi quay lại trang: hook phải có khả năng tạo request mới.
8. Kiểm tra cả ba danh sách Dự án, Công việc và Task vì chúng dùng chung hạ tầng cache.

## 6. Trạng thái tài liệu

- Nguyên nhân đã được xác định từ luồng code hiện tại.
- Tài liệu này chưa đại diện cho việc đã triển khai bản sửa.
- Hướng ưu tiên: sửa điều kiện xóa cache trong `SessionDataCacheProvider`, sau đó làm `useSessionQuery` phản ứng với cache invalidation.

