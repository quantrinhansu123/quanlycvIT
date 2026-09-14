import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException } from "@/lib/api/response";

/**
 * Idempotency cho các thao tác tạo quan trọng (GĐ9 của
 * PERF-UNIFIED-IMPLEMENTATION-PLAN.md). Dựa vào unique constraint
 * `(account_id, idempotency_key, scope)` trên bảng `mutation_requests`
 * (`supabase/migrations/20260802000200_mutation_requests_idempotency.sql`) —
 * KHÔNG dùng SELECT-rồi-INSERT vì có race condition khi 2 request cùng key đến
 * gần như đồng thời; unique constraint là nơi duy nhất đảm bảo chỉ 1 request
 * "thắng" và được phép chạy `handler`.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Đọc header `Idempotency-Key`; ném lỗi 400 nếu có nhưng không phải UUID hợp lệ. */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("idempotency-key");
  if (!raw) return null;
  if (!UUID_PATTERN.test(raw)) {
    throw new ApiException("Idempotency-Key phải là UUID hợp lệ.", 400);
  }
  return raw.toLowerCase();
}

interface HandlerResult<T> {
  status: number;
  body: T;
}

/**
 * Bọc một thao tác tạo dữ liệu để cùng account + cùng key + cùng scope chỉ thực
 * sự chạy đúng một lần. Request lặp (double-click, retry sau lỗi mạng không rõ
 * server đã ghi) nhận lại đúng response đã lưu của lần chạy thành công trước đó.
 *
 * `idempotencyKey` là `null` khi client không gửi header (client cũ hoặc thao
 * tác không cần bảo vệ) — trường hợp này chạy `handler` như bình thường, không
 * có lớp bảo vệ nào (giữ tương thích ngược, không bắt buộc mọi caller phải đổi).
 */
export async function withIdempotency<T>(
  supabase: ApiSupabaseClient,
  params: { accountId: string; idempotencyKey: string | null; scope: string },
  handler: () => Promise<HandlerResult<T>>
): Promise<HandlerResult<T>> {
  const { accountId, idempotencyKey, scope } = params;
  if (!idempotencyKey) return handler();

  const { error: insertError } = await supabase.from("mutation_requests").insert({
    account_id: accountId,
    idempotency_key: idempotencyKey,
    scope,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing } = await supabase
        .from("mutation_requests")
        .select("status, response_status, response_body")
        .eq("account_id", accountId)
        .eq("idempotency_key", idempotencyKey)
        .eq("scope", scope)
        .maybeSingle();

      if (existing?.status === "completed" && existing.response_status !== null) {
        return { status: existing.response_status as number, body: existing.response_body as T };
      }
      // Vẫn "processing": một request khác đang chạy đúng lúc này, hoặc một lần
      // chạy trước đã crash giữa chừng (không kịp update/delete). Trả 409 thay vì
      // tự chạy `handler` lại — tự chạy lại ở đây mới là nơi có thể tạo bản ghi
      // trùng thật. 409 không thuộc nhóm status được `api-client.ts` tự retry.
      throw new ApiException(
        "Yêu cầu này đang được xử lý hoặc đã được gửi trước đó. Vui lòng chờ vài giây rồi kiểm tra lại.",
        409
      );
    }
    // Lỗi khác ngoài unique violation (vd. bảng chưa migrate ở môi trường nào đó)
    // — idempotency chỉ là lớp bảo vệ phụ, không chặn thao tác chính vì lỗi ở đây.
    console.error("mutation_requests insert lỗi ngoài dự kiến:", insertError.code, insertError.message);
    return handler();
  }

  try {
    const result = await handler();
    await supabase
      .from("mutation_requests")
      .update({
        status: "completed",
        response_status: result.status,
        response_body: result.body as never,
        completed_at: new Date().toISOString(),
      })
      .eq("account_id", accountId)
      .eq("idempotency_key", idempotencyKey)
      .eq("scope", scope);
    return result;
  } catch (error) {
    // Thao tác chính thất bại (validate/DB lỗi) — xóa hẳn chỗ giữ để lần gửi lại
    // sau (cùng key, sau khi người dùng sửa lỗi) được coi là thao tác mới, không
    // bị 409 vĩnh viễn vì bản ghi "processing" không bao giờ được update.
    await supabase
      .from("mutation_requests")
      .delete()
      .eq("account_id", accountId)
      .eq("idempotency_key", idempotencyKey)
      .eq("scope", scope);
    throw error;
  }
}
