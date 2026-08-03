export interface UploadJob {
  id: string;
  upload: () => Promise<void>;
}

export interface UploadBatchResult {
  succeededIds: string[];
  failures: Array<{ id: string; reason: unknown }>;
}

/**
 * Chạy chung một hàng đợi upload có giới hạn. Kết quả thành công và lỗi được
 * tách riêng để UI giữ lại URL đã upload, còn đúng file lỗi cho lần thử sau.
 */
export async function runUploadBatch(
  jobs: UploadJob[],
  concurrency = 4
): Promise<UploadBatchResult> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Giới hạn upload đồng thời phải là số nguyên dương.");
  }
  const succeededIds: string[] = [];
  const failures: UploadBatchResult["failures"] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < jobs.length) {
      const job = jobs[nextIndex++];
      try {
        await job.upload();
        succeededIds.push(job.id);
      } catch (reason) {
        failures.push({ id: job.id, reason });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker())
  );
  return { succeededIds, failures };
}
