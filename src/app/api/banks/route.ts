import { apiSuccess, handleApiError } from "@/lib/api/response";
import { beginApiObservation } from "@/lib/api/observability";

// Danh sách ngân hàng gần như tĩnh, ít khi thay đổi trong ngày.
export const revalidate = 3600;

interface VietQrBank {
  id: number;
  name: string;
  code: string;
  shortName: string;
  logo?: string;
}

export async function GET(request: Request) {
  beginApiObservation(request);
  try {
    const response = await fetch("https://api.vietqr.io/v2/banks", {
      next: { revalidate },
    });
    if (!response.ok) throw new Error("Không thể tải danh sách ngân hàng.");

    const payload = await response.json() as { code?: string; data?: VietQrBank[] };
    if (payload.code !== "00" || !Array.isArray(payload.data)) {
      throw new Error("Dữ liệu ngân hàng không hợp lệ.");
    }

    return apiSuccess(
      payload.data.map((bank) => ({
        id: bank.id,
        name: bank.name,
        code: bank.code,
        shortName: bank.shortName,
        logo: bank.logo,
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}
