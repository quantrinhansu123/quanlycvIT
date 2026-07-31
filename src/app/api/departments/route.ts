import { revalidateTag } from "next/cache";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDepartmentInput } from "@/lib/api/department-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createDepartment, listDepartments } from "@/lib/supabase/departments";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    return apiSuccess(await listDepartments(supabase));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const department = await createDepartment(
      supabase,
      parseDepartmentInput(await readJsonObject(request))
    );
    revalidateTag("departments", { expire: 0 });
    return apiSuccess(department, 201, "Thêm phòng ban thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
