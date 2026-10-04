/**
 * Cache phiên trong bộ nhớ trình duyệt (không dùng localStorage/service worker).
 * Theo nguyên tắc bắt buộc ở PERF-UNIFIED-IMPLEMENTATION-PLAN.md mục 3:
 * - Khóa cache tối thiểu: accountId + role + resource + normalizedFilters + page/pageSize.
 * - Dedupe request đang chạy theo cùng key; response cũ không ghi đè response mới.
 * - Giới hạn số entry (LRU) để tránh phình bộ nhớ tab.
 * - Xóa toàn bộ khi logout/đổi tài khoản (xem SessionDataCacheProvider).
 */

export interface CacheTtl {
  /** Trong khoảng này dữ liệu được coi là mới, dùng thẳng không revalidate. */
  freshMs: number;
  /** Sau mốc này dữ liệu bị loại khỏi cache hẳn (không còn "dùng tạm được"). */
  staleMs: number;
}

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  staleAt: number;
  expiresAt: number;
}

type Fetcher<T> = (signal: AbortSignal) => Promise<T>;
type Listener = () => void;

interface PendingEntry<T> {
  promise: Promise<T>;
  controller: AbortController;
}

const DEFAULT_MAX_ENTRIES = 200;
const MAX_CONCURRENT_PREFETCH = 3;
const MAX_QUEUED_PREFETCH = 20;

export class SessionDataCache {
  private entries = new Map<string, CacheEntry<unknown>>();
  private pending = new Map<string, PendingEntry<unknown>>();
  private listeners = new Map<string, Set<Listener>>();
  private versions = new Map<string, number>();
  private epoch = 0;
  private readonly maxEntries: number;
  private readonly invalidationDependencies: Readonly<Record<string, readonly string[]>>;
  private activePrefetchCount = 0;
  private prefetchQueue: Array<() => void> = [];

  constructor(options: {
    maxEntries?: number;
    invalidationDependencies?: Readonly<Record<string, readonly string[]>>;
  } = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.invalidationDependencies = options.invalidationDependencies ?? {};
  }

  /** Đọc entry còn hạn dùng (fresh hoặc stale-nhưng-dùng-được); tự dọn nếu đã hết hạn. */
  get<T>(key: string): CacheEntry<T> | undefined {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    // Đưa lên cuối Map để duy trì thứ tự LRU (Map giữ thứ tự chèn).
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  isStale(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return true;
    return Date.now() > entry.staleAt;
  }

  set<T>(key: string, data: T, ttl: CacheTtl): void {
    const now = Date.now();
    // `set()` can be an optimistic update while an older revalidation request is
    // still running. Bump the version so that old response cannot overwrite the
    // newer mutation result when it finishes later.
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    this.entries.set(key, {
      data,
      fetchedAt: now,
      staleAt: now + ttl.freshMs,
      expiresAt: now + ttl.staleMs,
    });
    this.evictOverflow();
    this.notify(key);
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  /**
   * Gọi API cho một key, gộp (dedupe) nếu đã có request cùng key đang chạy.
   * Response luôn ghi vào đúng key của nó nên response cũ không thể ghi đè
   * response mới của một key khác — không cần sequence id riêng.
   */
  fetch<T>(key: string, fetcher: Fetcher<T>, ttl: CacheTtl): Promise<T> {
    const existingPending = this.pending.get(key) as PendingEntry<T> | undefined;
    if (existingPending) return existingPending.promise;

    const controller = new AbortController();
    const version = (this.versions.get(key) ?? 0) + 1;
    const epoch = this.epoch;
    this.versions.set(key, version);
    const promise = fetcher(controller.signal)
      .then((data) => {
        this.pending.delete(key);
        // Lớp bảo vệ thứ hai ngoài AbortController: fetcher/transport có thể vẫn
        // resolve sau abort. Chỉ request mới nhất trong cùng epoch được ghi cache.
        if (this.epoch === epoch && this.versions.get(key) === version) {
          this.set(key, data, ttl);
        }
        return data;
      })
      .catch((error: unknown) => {
        this.pending.delete(key);
        throw error;
      });
    this.pending.set(key, { promise, controller });
    return promise;
  }

  /** Nạp trước dữ liệu khi có ý định điều hướng (hover/focus) — âm thầm bỏ qua nếu lỗi. */
  prefetch<T>(key: string, fetcher: Fetcher<T>, ttl: CacheTtl): void {
    if (this.pending.has(key)) return;
    const entry = this.get<T>(key);
    if (entry && !this.isStale(key)) return;

    const run = () => {
      this.activePrefetchCount++;
      this.fetch(key, fetcher, ttl)
        .catch(() => {
          // Prefetch lỗi âm thầm — nếu người dùng thực sự mở trang, request thật sẽ tự báo lỗi.
        })
        .finally(() => {
          this.activePrefetchCount--;
          this.drainPrefetchQueue();
        });
    };

    if (this.activePrefetchCount < MAX_CONCURRENT_PREFETCH) {
      run();
    } else if (this.prefetchQueue.length < MAX_QUEUED_PREFETCH) {
      this.prefetchQueue.push(run);
    }
    // Hàng đợi đầy: bỏ qua yêu cầu prefetch này, không phải lỗi — người dùng lướt nhanh qua nhiều dòng.
  }

  private drainPrefetchQueue(): void {
    if (this.activePrefetchCount >= MAX_CONCURRENT_PREFETCH) return;
    const next = this.prefetchQueue.shift();
    if (next) next();
  }

  /**
   * Đánh dấu dữ liệu cũ theo key chính xác, hoặc theo "resource" (tiền tố trước dấu `|`) —
   * dùng sau mutation để buộc các trang/tab khác refetch dữ liệu mới nhất.
   *
   * Entry còn hạn vẫn được giữ để danh sách không biến mất trong lúc tải lại.
   * Request đang chạy thì bị hủy để response cũ không ghi đè kết quả mới.
   *
   * `exceptKey`: bỏ qua đúng key này khi invalidate theo resource — dùng khi component
   * gọi mutation đã tự `setData()` cập nhật ngay key hiện tại của nó, để tránh vừa ghi
   * xong lại bị chính invalidate() đánh dấu cũ và tải đè (không cần quan tâm thứ tự gọi setData/invalidate).
   */
  invalidate(resourceOrKey: string, exceptKey?: string): void {
    const isExactKey = this.entries.has(resourceOrKey) || this.pending.has(resourceOrKey);
    const matches = (key: string) => {
      if (key === exceptKey) return false;
      return isExactKey ? key === resourceOrKey : key === resourceOrKey || key.startsWith(`${resourceOrKey}|`);
    };

    for (const key of Array.from(this.entries.keys())) {
      if (!matches(key)) continue;
      const entry = this.entries.get(key);
      if (entry) entry.staleAt = 0;
    }
    for (const [key, pendingEntry] of Array.from(this.pending.entries())) {
      if (matches(key)) {
        this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
        // Xóa khỏi pending TRƯỚC khi abort để effect mới không tái sử dụng
        // promise đã hủy → tránh kẹt skeleton (loading mãi, không error).
        this.pending.delete(key);
        pendingEntry.controller.abort();
      }
    }
    for (const key of Array.from(this.listeners.keys())) {
      if (matches(key)) this.notify(key);
    }

    for (const [source, dependents] of Object.entries(this.invalidationDependencies)) {
      if (resourceOrKey !== source && !resourceOrKey.startsWith(`${source}|`)) continue;
      for (const dependent of dependents) this.invalidate(dependent);
    }
  }

  /** Xóa toàn bộ cache — bắt buộc gọi khi logout/đổi tài khoản (xem nguyên tắc bảo mật cache). */
  clear(): void {
    this.epoch++;
    for (const pendingEntry of this.pending.values()) pendingEntry.controller.abort();
    this.pending.clear();
    this.entries.clear();
    this.versions.clear();
    this.prefetchQueue = [];
    for (const key of Array.from(this.listeners.keys())) this.notify(key);
  }

  subscribe(key: string, listener: Listener): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener);
    return () => {
      const set = this.listeners.get(key);
      set?.delete(listener);
      if (set && set.size === 0) this.listeners.delete(key);
    };
  }

  private notify(key: string): void {
    this.listeners.get(key)?.forEach((listener) => listener());
  }
}

/**
 * Khóa cache tối thiểu theo mục 3 của kế hoạch: accountId + role + resource +
 * normalizedFilters + page/pageSize (page/pageSize bỏ qua khi resource không phân trang).
 */
export function buildCacheKey(params: {
  accountId: string;
  role: string;
  resource: string;
  filters?: Record<string, string | number | boolean | readonly string[] | undefined>;
  page?: number;
  pageSize?: number;
}): string {
  const normalizedFilters = Object.entries(params.filters ?? {})
    .filter(([, value]) => value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? [...value].sort().join(",") : String(value)}`)
    .join("&");

  const pagingSuffix =
    params.page !== undefined && params.pageSize !== undefined ? `|p${params.page}|s${params.pageSize}` : "";

  return `${params.resource}|${params.accountId}|${params.role}|${normalizedFilters}${pagingSuffix}`;
}
