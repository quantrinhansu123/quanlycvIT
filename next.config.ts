import type { NextConfig } from "next";

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;

const nextConfig: NextConfig = {
  images: {
    // AVIF nhỏ hơn WebP nhưng mã hóa chậm hơn, nên đặt sau WebP để Next ưu tiên WebP.
    formats: ["image/webp", "image/avif"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.vietqr.io",
        pathname: "/img/**",
      },
      // Chỉ chấp nhận ảnh được upload vào đúng Cloudinary account của ứng dụng.
      ...(cloudinaryCloudName
        ? [
            {
              protocol: "https" as const,
              hostname: "res.cloudinary.com",
              pathname: `/${cloudinaryCloudName}/image/upload/**`,
            },
          ]
        : []),
    ],
  },
  experimental: {
    // lucide-react đã được Next tối ưu mặc định; khai báo tường minh cùng pdfmake
    // để giữ hành vi rõ ràng khi nâng cấp Next.
    optimizePackageImports: ["lucide-react", "pdfmake"],
  },
};

export default nextConfig;
