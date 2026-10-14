import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function updateSubtaskUpdates(");
const end = source.indexOf("export async function updateSubtask(", start);
const compiled = ts.transpileModule(source.slice(start, end).replace("export ", ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ status = "todo", failure = null } = {}) {
  const writes = [];
  const supabase = { from() {
    let payload;
    const query = {
      select() { return query; },
      eq() { return query; },
      update(value) { payload = value; writes.push(value); return query; },
      async maybeSingle() {
        return payload
          ? { data: failure ? null : { id: "task" }, error: failure }
          : { data: { trang_thai: status }, error: null };
      },
    };
    return query;
  } };
  const save = new Function("throwDatabaseError", "toApiStatus", "ApiException", "decodeHandover",
    "detailTaskProgressPercent", "encodeHandoverContent", "getSubtask",
    `${compiled}; return updateSubtaskUpdates;`)(
    (error) => { if (error) throw error; }, (status) => status, Error,
    () => ({ rows: {} }), (_, rows) => rows.accepted ? 100 : 0,
    JSON.stringify, async () => ({ id: "task" }),
  );
  return { save: (updates, details) => save(supabase, "task", updates, details), writes };
}

test("description edits do not rewrite assignments or other Task metadata", async () => {
  const { save, writes } = setup();
  await save([], { description: "Updated detail" });
  assert.deepEqual(writes, [{ cap_nhat_bo_sung: [], mo_ta: "Updated detail", tien_do_thuc_te: 0 }]);
});

test("new detail and acceptance are persisted in a single write", async () => {
  const { save, writes } = setup();
  const updates = [{ id: "detail", description: "New detail" }];
  const handover = { rows: { accepted: {} }, imageUrl: "", text: "", statuses: {} };
  await save(updates, { handover });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].cap_nhat_bo_sung, updates);
  assert.equal(writes[0].ban_giao_noi_dung, JSON.stringify(handover));
  assert.equal(writes[0].tien_do_thuc_te, 100);
});

test("completed Tasks reject detail changes before writing", async () => {
  const { save, writes } = setup({ status: "done" });
  await assert.rejects(save([], { description: "Edit" }));
  assert.equal(writes.length, 0);
});

test("database failure is reported instead of returning save success", async () => {
  const { save } = setup({ failure: new Error("Database unavailable") });
  await assert.rejects(save([], { description: "Edit" }), /Database unavailable/);
});
