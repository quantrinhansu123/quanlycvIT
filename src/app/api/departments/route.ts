import { unstable_cache, revalidateTag } from "next/cache";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDepartmentInput } from "@/lib/api/department-validation";
import { createApiSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/api";
import { createDepartment, listDepartments } from "@/lib/supabase/departments";

// Phòng ban thay đổi hiếm khi; cache 1 giờ, xóa sớm hơn qua revalidateTag khi có thay đổi.
const getCachedDepartments = unstable_cache(
  async () => listDepartments(createServerSupabaseClient()),
  ["departments"],
  { revalidate: 3600, tags: ["departments"] }
);

export async function GET() {
  try {
    return apiSuccess(await getCachedDepartments());
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
    revalidateTag("departments", { expire: 0 });
    return apiSuccess(department, 201, "Thêm phòng ban thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
