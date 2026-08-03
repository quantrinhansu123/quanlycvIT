import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseAccountInput } from "@/lib/api/account-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createAccount, listAccountsPage } from "@/lib/supabase/accounts";
import type { AccountListFilters, AccountRole, AccountStatus } from "@/types/account";

const ROLES = new Set<AccountRole>(["admin", "manager", "member"]);
const STATUSES = new Set<AccountStatus>(["active", "inactive"]);
const SORTS = new Set<NonNullable<AccountListFilters["sort"]>>([
  "employeeCode", "name", "username", "startDate", "createdAt",
]);

function positiveInteger(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    assertManagerOrAdmin(access);
    const url = new URL(request.url);
    const role = url.searchParams.get("role") as AccountRole | null;
    const status = url.searchParams.get("status") as AccountStatus | null;
    const sort = url.searchParams.get("sort") as AccountListFilters["sort"] | null;
    const direction = url.searchParams.get("direction");
    return apiSuccess(await listAccountsPage(supabase, {
      search: url.searchParams.get("search") || undefined,
      departmentId: url.searchParams.get("departmentId") || undefined,
      position: url.searchParams.get("position") || undefined,
      role: role && ROLES.has(role) ? role : undefined,
      status: status && STATUSES.has(status) ? status : undefined,
      sort: sort && SORTS.has(sort) ? sort : undefined,
      direction: direction === "asc" ? "asc" : "desc",
      page: positiveInteger(url.searchParams.get("page"), 1, 1_000_000),
      pageSize: positiveInteger(url.searchParams.get("pageSize"), 50, 100),
    }, access.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const account = await createAccount(
      supabase,
      parseAccountInput(await readJsonObject(request))
    );
    return apiSuccess(account, 201, "Thêm tài khoản thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
