"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Bản nháp form an toàn (GĐ7 của PERF-UNIFIED-IMPLEMENTATION-PLAN.md).
 *
 * Nguyên tắc bắt buộc:
 * - Mặc định `sessionStorage`; chỉ dùng `localStorage` khi người dùng bật "Ghi nhớ
 *   bản nháp trên thiết bị này" (tham số `persistent`) và form cho phép (`allowPersistent`).
 * - Không tự áp draft đè lên dữ liệu form hiện tại — hook chỉ trả về draft tìm được,
 *   component gọi `applyDraft`/`clearDraft` theo hành động người dùng (Khôi phục/Bỏ).
 * - Draft hết hạn (`expiresAt`) hoặc sai `schemaVersion` bị coi như không tồn tại.
 */

const SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 800;
const DRAFT_KEY_PREFIX = "form-draft:";

interface DraftEnvelope<T> {
  schemaVersion: number;
  savedAt: number;
  expiresAt: number;
  /** `updatedAt` (hoặc tương đương) của bản ghi tại lúc lưu draft — dùng để phát hiện xung đột. */
  entityVersion?: string;
  data: T;
}

export interface FoundDraft<T> {
  data: T;
  savedAt: number;
  /** true nếu bản ghi server đã đổi (`entityVersion` hiện tại khác lúc lưu draft). */
  conflict: boolean;
}

interface UseVersionedFormDraftOptions {
  /**
   * Khóa lưu trữ đầy đủ, đã bao gồm accountId + loại form + create/edit + entity id
   * (dùng `buildFormDraftKey`). `null` khi chưa đủ điều kiện xác định khóa (ví dụ
   * chưa biết accountId) — hook sẽ không đọc/ghi gì, coi như tắt.
   */
  storageKey: string | null;
  /** `updatedAt` hiện tại của bản ghi (nếu form đang ở chế độ sửa) để so sánh xung đột. */
  entityVersion?: string;
  ttlMs?: number;
  /** false: luôn dùng sessionStorage, không cho chọn "ghi nhớ trên thiết bị" (vd. giao dịch tài chính). */
  allowPersistent?: boolean;
}

export function buildFormDraftKey(params: {
  accountId: string;
  formType: string;
  mode: "create" | "edit";
  entityId?: string;
}): string {
  return `${DRAFT_KEY_PREFIX}${params.accountId}:${params.formType}:${params.mode}:${params.entityId ?? "new"}`;
}

function getStorages(): Storage[] {
  if (typeof window === "undefined") return [];
  return [window.sessionStorage, window.localStorage];
}

function readEnvelope<T>(storageKey: string): { envelope: DraftEnvelope<T>; storage: Storage } | null {
  for (const storage of getStorages()) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(storageKey);
    } catch {
      continue;
    }
    if (!raw) continue;
    try {
      const envelope = JSON.parse(raw) as DraftEnvelope<T>;
      if (envelope.schemaVersion !== SCHEMA_VERSION || Date.now() > envelope.expiresAt) {
        storage.removeItem(storageKey);
        continue;
      }
      return { envelope, storage };
    } catch {
      storage.removeItem(storageKey);
    }
  }
  return null;
}

export function useVersionedFormDraft<T>({
  storageKey,
  entityVersion,
  ttlMs = DEFAULT_TTL_MS,
  allowPersistent = true,
}: UseVersionedFormDraftOptions) {
  const [draft, setDraft] = useState<FoundDraft<T> | null>(null);
  const [persistent, setPersistent] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Chỉ đọc draft có sẵn một lần khi mount (đúng key hiện tại) — không đọc lại liên
  // tục để tránh banner "có draft" tự bật lại sau khi người dùng đã Khôi phục/Bỏ.
  useEffect(() => {
    if (!storageKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(null);
      return;
    }
    const found = readEnvelope<T>(storageKey);
    setDraft(
      found
        ? {
            data: found.envelope.data,
            savedAt: found.envelope.savedAt,
            conflict: Boolean(
              found.envelope.entityVersion &&
                entityVersion &&
                found.envelope.entityVersion !== entityVersion
            ),
          }
        : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    if (!storageKey) return;
    for (const storage of getStorages()) {
      try {
        storage.removeItem(storageKey);
      } catch {
        // Storage bị chặn (chế độ ẩn danh nghiêm ngặt) — không phải lỗi nghiệp vụ, bỏ qua.
      }
    }
    setDraft(null);
  }, [storageKey]);

  const scheduleSave = useCallback(
    (data: T) => {
      if (!storageKey || typeof window === "undefined") return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        const envelope: DraftEnvelope<T> = {
          schemaVersion: SCHEMA_VERSION,
          savedAt: Date.now(),
          expiresAt: Date.now() + ttlMs,
          entityVersion,
          data,
        };
        const target = persistent && allowPersistent ? window.localStorage : window.sessionStorage;
        const other = target === window.localStorage ? window.sessionStorage : window.localStorage;
        try {
          target.setItem(storageKey, JSON.stringify(envelope));
          other.removeItem(storageKey);
        } catch {
          // Storage đầy hoặc bị chặn — bản nháp chỉ là tiện ích phụ, không chặn luồng nhập liệu.
        }
      }, DEBOUNCE_MS);
    },
    [storageKey, ttlMs, entityVersion, persistent, allowPersistent]
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  return { draft, scheduleSave, clearDraft, persistent, setPersistent: allowPersistent ? setPersistent : undefined };
}

/**
 * Xóa toàn bộ bản nháp form (mọi tài khoản, cả 2 loại storage) — gọi khi đăng
 * xuất/đổi tài khoản trên cùng máy (xem `SessionDataCacheProvider`), cùng chỗ đã
 * xóa `SessionDataCache` để không lộ bản nháp của tài khoản trước.
 */
export function clearAllFormDrafts(): void {
  for (const storage of getStorages()) {
    const keysToRemove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(DRAFT_KEY_PREFIX)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      try {
        storage.removeItem(key);
      } catch {
        // Bỏ qua — dọn dẹp best-effort.
      }
    }
  }
}
