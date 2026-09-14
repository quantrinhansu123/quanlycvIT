# Hệ thống quản lý nhân sự và công việc

Ứng dụng quản trị nội bộ giúp doanh nghiệp quản lý tập trung:

- Hồ sơ nhân sự, tài khoản, phòng ban và chức vụ.
- Dự án, công việc, task, người phụ trách và báo cáo tiến độ.
- Dashboard thống kê tổng quan.

Một số phân hệ trên menu vẫn đang trong giai đoạn phát triển.

## Công nghệ

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4
- Supabase (PostgreSQL, Auth)
- Cloudinary (lưu ảnh đại diện)

## Yêu cầu

- Node.js 20 trở lên
- pnpm
- Một dự án Supabase
- Tài khoản Cloudinary nếu sử dụng chức năng tải ảnh đại diện

## Cấu hình

Sao chép file môi trường mẫu:

```bash
cp .env.example .env.local
```

Trên Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Điền các biến trong `.env.local`:

| Biến | Mô tả |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Đường dẫn API, mặc định là `/api` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL của dự án Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key của Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key dùng ở backend để quản trị tài khoản và mật khẩu |
| `CLOUDINARY_CLOUD_NAME` | Cloud name của Cloudinary |
| `CLOUDINARY_API_KEY` | API key của Cloudinary |
| `CLOUDINARY_API_SECRET` | API secret của Cloudinary |

> Không commit `.env.local` hoặc đưa `SUPABASE_SERVICE_ROLE_KEY` và `CLOUDINARY_API_SECRET` ra phía client.

### Khởi tạo cơ sở dữ liệu

Liên kết Supabase CLI với dự án, sau đó chạy migration:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <PROJECT_REF>
pnpm exec supabase db push
```

Nếu cần dữ liệu mẫu cho môi trường phát triển, chạy nội dung file `supabase/seed.sql` trong Supabase Dashboard → SQL Editor.

## Cài đặt và chạy

```bash
pnpm install
pnpm dev
```

Mở [http://localhost:3002](http://localhost:3002).

Chạy bản production:

```bash
pnpm build
pnpm start
```

Kiểm tra mã nguồn:

```bash
pnpm lint
```

## Lưu ý triển khai

Các migration có hậu tố `dev_anon` cấp quyền tạm cho role `anon` để phục vụ phát triển. Trước khi đưa lên production, cần rà soát lại RLS/policy, chuyển quyền phù hợp sang role `authenticated` và bảo vệ các API theo phiên đăng nhập.
