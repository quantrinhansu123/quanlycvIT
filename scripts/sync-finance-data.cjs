/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Đồng bộ dữ liệu Thu chi từ Supabase của app chính sang Supabase TÀI CHÍNH.
 *
 * Cách dùng (sau khi đã chạy file SQL khởi tạo ở project tài chính):
 *   node scripts/sync-finance-data.cjs --dry-run   # chỉ đọc, không ghi
 *   node scripts/sync-finance-data.cjs             # upsert toàn bộ
 *   node scripts/sync-finance-data.cjs --replace   # xóa dữ liệu tài chính cũ rồi ghi lại
 */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");
const PAGE_SIZE = 500;

function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) throw new Error("Không tìm thấy .env.local");
  return Object.fromEntries(
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

async function fetchAll(client, table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function insertAll(client, table, rows) {
  for (const batch of chunks(rows, 200)) {
    const { error } = await client.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function deleteAll(client, table) {
  const { error } = await client.from(table).delete().not("id", "is", null);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function main() {
  const env = loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const replace = process.argv.includes("--replace");

  const sourceUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const sourceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const financeUrl = env.FINANCE_SUPABASE_URL;
  const financeKey = env.FINANCE_SUPABASE_SERVICE_ROLE_KEY;

  if (!sourceUrl || !sourceKey) throw new Error("Thiếu cấu hình Supabase nguồn trong .env.local");
  if (!financeUrl || !financeKey) throw new Error("Thiếu FINANCE_SUPABASE_URL / FINANCE_SUPABASE_SERVICE_ROLE_KEY trong .env.local");

  const source = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
  const finance = createClient(financeUrl, financeKey, { auth: { persistSession: false } });

  const categories = await fetchAll(source, "thu_chi_danh_muc");
  const transactions = await fetchAll(source, "thu_chi");
  console.log(`Nguồn: ${categories.length} danh mục, ${transactions.length} giao dịch.`);

  for (const table of ["thu_chi_danh_muc", "thu_chi"]) {
    const { error } = await finance.from(table).select("id").limit(1);
    if (error) {
      throw new Error(
        `Project tài chính chưa có bảng ${table} (${error.code ?? "?"}): ${error.message}\n` +
        "Hãy chạy supabase/finance-project/20261106000100_init_finance_project.sql trong SQL Editor của project tài chính trước."
      );
    }
  }

  if (dryRun) {
    console.log("--dry-run: không ghi dữ liệu sang project tài chính.");
    return;
  }

  if (replace) {
    await deleteAll(finance, "thu_chi");
    await deleteAll(finance, "thu_chi_danh_muc");
    console.log("Đã xóa dữ liệu cũ ở project tài chính.");
  }

  await insertAll(finance, "thu_chi_danh_muc", categories);
  console.log(`Đã ghi ${categories.length} danh mục.`);
  await insertAll(finance, "thu_chi", transactions);
  console.log(`Đã ghi ${transactions.length} giao dịch.`);

  for (const [table, expected] of [["thu_chi_danh_muc", categories.length], ["thu_chi", transactions.length]]) {
    const { count, error } = await finance.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`Kiểm tra ${table}: ${count ?? 0}/${expected} dòng.`);
  }

  console.log("Hoàn tất đồng bộ dữ liệu tài chính.");
}

main().catch((error) => {
  console.error(`LỖI: ${error.message}`);
  process.exitCode = 1;
});
