import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDepartmentInput } from "@/lib/api/department-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createDepartment, listDepartments } from "@/lib/supabase/departments";

export async function GET(request: Request) {
  try {
    return apiSuccess(await listDepartments(createApiSupabaseClient(request)));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const department = await createDepartment(
      createApiSupabaseClient(request),
      parseDepartmentInput(await readJsonObject(request))
    );
    return apiSuccess(department, 201, "Thêm phòng ban thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
